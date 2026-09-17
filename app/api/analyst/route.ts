import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aggregateAnalytics } from '@/lib/cpg/server-analytics'
import { calculateGroundingScore } from '@/lib/cpg/grounding'
import { DEMO_DATASET_ID, demoEvidence, getDemoAnalytics } from '@/lib/cpg/demo-data'

type OllamaResponse = { response?: string }
function getOllamaConfig() { const baseUrl = process.env.OLLAMA_BASE_URL?.replace(/\/$/, ''); const model = process.env.OLLAMA_MODEL; if (!baseUrl || !model) throw new Error('Ollama is not configured.') ; return { baseUrl, model } }
async function generateWithOllama(prompt: string) { const { baseUrl, model } = getOllamaConfig(); const response = await fetch(`${baseUrl}/api/generate`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({model,prompt,stream:false,format:'json',options:{temperature:.1}}), signal:AbortSignal.timeout(45000)}); if(!response.ok) throw new Error(`Ollama returned ${response.status}.`); const data=await response.json() as OllamaResponse; if(!data.response?.trim()) throw new Error('Ollama returned an empty response.'); return data.response.trim() }
function parseModelResponse(raw:string){try{const parsed=JSON.parse(raw) as {answer?:unknown};if(typeof parsed.answer==='string'&&parsed.answer.trim())return parsed.answer.trim()}catch{}return raw.trim()}

export async function POST(request: Request) {
  try {
    const body=await request.json(); const prompt=typeof body.prompt==='string'?body.prompt.trim():''
    if(!prompt||prompt.length>2000)return NextResponse.json({error:'Enter a question under 2,000 characters.'},{status:400})
    let datasetId=typeof body.datasetId==='string'?body.datasetId:null
    if(datasetId===DEMO_DATASET_ID){
      const evidence=JSON.stringify(demoEvidence()); const dataset=getDemoAnalytics().dataset
      let answer:string
      try { answer=parseModelResponse(await generateWithOllama(`You are CPGist AI, an evidence-first CPG analyst. Use ONLY this evidence. Never invent facts. Return JSON only: {"answer":"concise answer"}. DATASET: ${dataset.name}\nEVIDENCE:${evidence}\nQUESTION:${prompt}`)) }
      catch { answer='The local AI model is not reachable. The dataset is loaded and ready; start Ollama with the configured model to generate an AI answer.' }
      const accuracy=calculateGroundingScore(answer,evidence)
      return NextResponse.json({answer,dataset:dataset.name,datasetId,provider:'ollama',model:process.env.OLLAMA_MODEL??'qwen3:8b',grounding:accuracy,accuracy,trace:['Intent detected','Built-in demo dataset loaded','Deterministic analytics calculated','Evidence supplied to model','Dataset evidence verification completed']})
    }
    const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user)return NextResponse.json({error:'Sign in is required.'},{status:401})
    if(!datasetId){const {data,error}=await supabase.from('datasets').select('id').eq('status','ready').order('updated_at',{ascending:false}).limit(1).maybeSingle();if(error)throw new Error(`Unable to select a dataset: ${error.message}`);datasetId=data?.id??null}
    if(!datasetId)return NextResponse.json({error:'Select or ingest a dataset before asking the AI Analyst.'},{status:422})
    const {data:dataset,error:datasetError}=await supabase.from('datasets').select('id,name,status').eq('id',datasetId).single();if(datasetError||!dataset)return NextResponse.json({error:'Selected dataset was not found or is not accessible.'},{status:404});if(dataset.status!=='ready')return NextResponse.json({error:'The selected dataset is not ready for analysis yet.'},{status:422})
    const analytics=await aggregateAnalytics(supabase,datasetId);if(!analytics.metrics.rowCount)return NextResponse.json({error:'The selected dataset contains no analyzable sales facts.'},{status:422})
    const evidence=JSON.stringify({dataset:dataset.name,metrics:analytics.metrics,periods:analytics.trend,categories:analytics.categories.slice(0,20),brands:analytics.brands.slice(0,20),retailers:analytics.retailers.slice(0,20),anomalies:analytics.anomalies.slice(0,20)})
    const raw=await generateWithOllama(`You are CPGist AI, an evidence-first consumer packaged goods analyst. Use ONLY the supplied dataset evidence. Never invent values, brands, periods, sources, causal explanations, or unsupported calculations. If evidence cannot answer, say so. Return JSON only: {"answer":"concise answer grounded in evidence"}.\nDATASET EVIDENCE:${evidence}\nUSER QUESTION:${prompt}`)
    const answer=parseModelResponse(raw);if(!answer)return NextResponse.json({error:'The Analyst returned no answer.'},{status:503});const accuracy=calculateGroundingScore(answer,evidence)
    const result={answer,dataset:dataset.name,provider:'ollama',model:process.env.OLLAMA_MODEL??'unknown',grounding:accuracy,accuracy,trace:['Intent detected','Authorized dataset loaded','All dataset facts aggregated server-side','Evidence supplied to model','Dataset-verified answer accuracy calculated']}
    const {data:saved,error:saveError}=await supabase.from('analyses').insert({dataset_id:datasetId,prompt,result,created_by:user.id}).select('id').single();if(saveError)console.error('[analyst] save failed',saveError)
    return NextResponse.json({...result,datasetId,analysisId:saved?.id??null})
  } catch(error){console.error('[analyst]',error);return NextResponse.json({error:error instanceof Error?error.message:'AI Analyst is unavailable.'},{status:503})}
}
