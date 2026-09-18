import { generateText } from 'ai'
import { createGroq } from '@ai-sdk/groq'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aggregateAnalytics } from '@/lib/cpg/server-analytics'
import { calculateGroundingScore } from '@/lib/cpg/grounding'

const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile'

function getGroqConfig() {
  const apiKey = process.env.GROQ_API_KEY?.trim()
  const model = process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL
  if (!apiKey) throw new Error('AI provider is not configured.')
  return { provider: createGroq({ apiKey }), model }
}

async function generateWithGroq(prompt: string) {
  const { provider, model } = getGroqConfig()
  const result = await generateText({
    model: provider(model),
    prompt,
    temperature: 0.1,
    abortSignal: AbortSignal.timeout(45000),
  })
  if (!result.text.trim()) throw new Error('AI service temporarily unavailable.')
  return { text: result.text.trim(), model }
}

function parseModelResponse(raw: string) {
  try {
    const parsed = JSON.parse(raw) as { answer?: unknown }
    if (typeof parsed.answer === 'string' && parsed.answer.trim()) return parsed.answer.trim()
  } catch {}
  return raw.trim()
}
function classifyIntent(prompt:string){const value=prompt.toLowerCase();if(/anomal|outlier|spike|drop/.test(value))return 'anomalies';if(/promo|promotion|lift|incremental/.test(value))return 'promotion';if(/price|pricing|elastic/.test(value))return 'pricing';if(/retailer|distribution|store/.test(value))return 'retailers';if(/category|segment/.test(value))return 'categories';if(/brand|share|compet/.test(value))return 'brands';if(/trend|period|month|quarter|sales/.test(value))return 'trend';return 'overview'}
function buildEvidence(intent:string,analytics:Awaited<ReturnType<typeof aggregateAnalytics>>){const base={metrics:analytics.metrics,periods:analytics.trend};if(intent==='brands')return {...base,brands:analytics.brands.slice(0,20)};if(intent==='categories')return {...base,categories:analytics.categories.slice(0,20)};if(intent==='retailers')return {...base,retailers:analytics.retailers.slice(0,20)};if(intent==='anomalies')return {...base,anomalies:analytics.anomalies.slice(0,20)};return {...base,categories:analytics.categories.slice(0,10),brands:analytics.brands.slice(0,20),retailers:analytics.retailers.slice(0,10),anomalies:analytics.anomalies.slice(0,20)}}

export async function POST(request: Request) {
  try {
    const body=await request.json(); const prompt=typeof body.prompt==='string'?body.prompt.trim():''
    if(!prompt||prompt.length>2000)return NextResponse.json({error:'Enter a question under 2,000 characters.'},{status:400})
    let datasetId=typeof body.datasetId==='string'?body.datasetId:null
    const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user)return NextResponse.json({error:'Sign in is required.'},{status:401})
    if(!datasetId){const {data,error}=await supabase.from('datasets').select('id').eq('status','ready').order('updated_at',{ascending:false}).limit(1).maybeSingle();if(error)throw new Error(`Unable to select a dataset: ${error.message}`);datasetId=data?.id??null}
    if(!datasetId)return NextResponse.json({error:'Select or ingest a dataset before asking the AI Analyst.'},{status:422})
    const {data:dataset,error:datasetError}=await supabase.from('datasets').select('id,name,status').eq('id',datasetId).single();if(datasetError||!dataset)return NextResponse.json({error:'Selected dataset was not found or is not accessible.'},{status:404});if(dataset.status!=='ready')return NextResponse.json({error:'The selected dataset is not ready for analysis yet.'},{status:422})
    const analytics=await aggregateAnalytics(supabase,datasetId);if(!analytics.metrics.rowCount)return NextResponse.json({error:'The selected dataset contains no analyzable sales facts.'},{status:422})
    const intent=classifyIntent(prompt)
    const analyticalPlan={intent,tool:intent==='brands'?'brand_performance':intent==='categories'?'category_performance':intent==='retailers'?'retailer_performance':intent==='anomalies'?'anomaly_detection':intent==='promotion'?'promotion_lift':intent==='pricing'?'pricing_analysis':'sales_trend',metricEngine:'aggregateAnalytics',evidenceScope:'selected dataset only'}
    const evidence=JSON.stringify({dataset:dataset.name,plan:analyticalPlan,...buildEvidence(intent,analytics)})
    const generated = await generateWithGroq(`You are CPGist AI, an evidence-first consumer packaged goods analyst. Execute the supplied analytical plan using only its precomputed metric-engine evidence. Do not calculate from raw rows, invent values, or infer causality. The question intent is ${intent}. If evidence cannot answer, say so. Return JSON only: {"answer":"concise answer grounded in evidence"}.\nANALYTICAL PLAN:${JSON.stringify(analyticalPlan)}\nVERIFIED EVIDENCE:${evidence}\nUSER QUESTION:${prompt}`)
    const answer=parseModelResponse(generated.text);if(!answer)return NextResponse.json({error:'Insufficient evidence to answer reliably.'},{status:422});const accuracy=calculateGroundingScore(answer,evidence)
    const result={answer,dataset:dataset.name,provider:'groq',model:generated.model,grounding:accuracy,accuracy,plan:analyticalPlan,trace:['Intent detected','Analytical plan selected','Metric engine executed server-side','Verified evidence supplied to Groq','Dataset-verified answer accuracy calculated']}
    const {data:saved,error:saveError}=await supabase.from('analyses').insert({dataset_id:datasetId,prompt,result,created_by:user.id}).select('id').single();if(saveError)console.error('[analyst] save failed',saveError)
    return NextResponse.json({...result,datasetId,analysisId:saved?.id??null})
  } catch (error) {
    console.error('[analyst]', error)
    const message = error instanceof Error ? error.message : ''
    if (message === 'AI provider is not configured.') return NextResponse.json({ error: message }, { status: 503 })
    if (message.includes('AI service temporarily unavailable') || message.includes('AI_APICallError')) {
      return NextResponse.json({ error: 'AI service temporarily unavailable.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'AI service temporarily unavailable.' }, { status: 503 })
  }
}
