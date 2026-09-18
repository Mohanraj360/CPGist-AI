import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'Synthetic bootstrap data is disabled. Import a real dataset.' }, { status: 410 })
}
