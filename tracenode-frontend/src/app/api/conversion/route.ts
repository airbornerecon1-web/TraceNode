import { NextResponse } from 'next/server';
import { supabase, mockDb, isMockMode } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    let record: any = null;

    if (isMockMode) {
      record = mockDb.get(id);
    } else {
      try {
        const { data, error } = await supabase
          .from('conversions')
          .select('*')
          .eq('id', id)
          .single();
        
        if (error) throw error;
        record = data;
      } catch (err: any) {
        console.warn(`[API/Conversion] Supabase lookup failed for ID ${id}, falling back to mockDb:`, err.message);
        record = mockDb.get(id);
      }
    }

    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    return NextResponse.json(record);
  } catch (error: any) {
    console.error('[API/Conversion] Error fetching conversion status:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
