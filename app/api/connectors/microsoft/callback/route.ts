import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptSecret } from '@/lib/connectors/crypto'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const url=new URL(request.url),code=url.searchParams.get('code'),state=url.searchParams.get('state')
  const c=await cookies()
  if(!code||!state||state!==c.get('cpgist_microsoft_oauth_state')?.value)return NextResponse.json({error:'Invalid Microsoft OAuth state.'},{status:400})
  const clientId=process.env.MICROSOFT_CLIENT_ID,secret=process.env.MICROSOFT_CLIENT_SECRET,tenant=process.env.MICROSOFT_TENANT_ID,redirect=process.env.MICROSOFT_REDIRECT_URI
  if(!clientId||!secret||!tenant||!redirect)return NextResponse.json({error:'Microsoft OAuth is not configured.'},{status:503})
  const tokenResponse=await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:secret,code,redirect_uri:redirect,grant_type:'authorization_code',scope:'openid profile email offline_access User.Read Files.Read.All Sites.Read.All'}),cache:'no-store'})
  const tokens=await tokenResponse.json()
  if(!tokenResponse.ok)return NextResponse.json({error:'Microsoft OAuth token exchange failed.',detail:tokens?.error_description??tokens?.error},{status:502})
  const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.redirect(new URL('/login',request.url))
  const {error}=await supabase.from('data_connections').insert({provider:'microsoft_graph',status:'connected',metadata:{access_token:encryptSecret(tokens.access_token),refresh_token:tokens.refresh_token?encryptSecret(tokens.refresh_token):null,expires_in:tokens.expires_in,scope:tokens.scope??null},created_by:user.id})
  if(error)return NextResponse.json({error:'Connection could not be saved.'},{status:503})
  const response=NextResponse.redirect(new URL('/?connected=microsoft',request.url));response.cookies.delete('cpgist_microsoft_oauth_state');return response
}
