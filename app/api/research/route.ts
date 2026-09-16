import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime='nodejs'

export async function POST(request:Request){
  const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser()
  if(!user)return NextResponse.json({error:'Sign in is required.'},{status:401})
  const body=await request.json().catch(()=>null),target=typeof body?.url==='string'?body.url.trim():''
  if(!/^https?:\/\//i.test(target))return NextResponse.json({error:'A valid http(s) URL is required.'},{status:400})
  const base=process.env.AGENT_REACH_BASE_URL?.replace(/\/$/,''),key=process.env.AGENT_REACH_API_KEY
  if(!base||!key)return NextResponse.json({error:'Agent-Reach is not configured. Set AGENT_REACH_BASE_URL and AGENT_REACH_API_KEY.'},{status:503})
  const path=process.env.AGENT_REACH_SCRAPE_PATH||'/scrape'
  try{
    const r=await fetch(`${base}${path}`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({url:target}),signal:AbortSignal.timeout(60000),cache:'no-store'})
    const data=await r.json().catch(()=>({}))
    if(!r.ok)return NextResponse.json({error:'Agent-Reach returned an error.',detail:data},{status:502})
    return NextResponse.json({provider:'agent-reach',url:target,result:data})
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Agent-Reach request failed.'},{status:502})}
}
