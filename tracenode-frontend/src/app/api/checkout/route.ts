import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { mockDb, isMockMode, isStripeMockMode } from '@/lib/supabase';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key"
);

export async function POST(request: Request) {
  try {
    const { svg_content, mode } = await request.json();

    if (!svg_content) {
      return NextResponse.json({ error: 'Missing svg_content' }, { status: 400 });
    }

    let conversionRecord: { id: string; svg_content: string; status: string } | null = null;

    // 1. Save pending conversion in database / mockDb
    if (isMockMode) {
      console.log('[API/Checkout] Running in Mock Database Mode.');
      conversionRecord = mockDb.insert(svg_content, 'pending');
    } else {
      try {
        const { data, error } = await supabase
          .from('conversions')
          .insert({
            svg_content,
            status: 'pending'
          })
          .select()
          .single();

        if (error) throw error;
        conversionRecord = data;
      } catch (err: any) {
        console.warn('[API/Checkout] Failed to insert in Supabase database, falling back to mockDb:', err.message);
        conversionRecord = mockDb.insert(svg_content, 'pending');
      }
    }

    if (!conversionRecord) {
      return NextResponse.json({ error: 'Failed to create conversion record' }, { status: 500 });
    }

    const conversionId = conversionRecord.id;

    // 2. Stripe Checkout Integration
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    if (isStripeMockMode) {
      console.log('[API/Checkout] Running in Mock Stripe Mode.');
      // Return a simulated stripe redirect URL pointing to our internal sandbox screen
      const mockCheckoutUrl = `${siteUrl}/?mock_checkout=true&conversion_id=${conversionId}&mode=${mode}`;
      return NextResponse.json({ url: mockCheckoutUrl });
    } else {
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
      const stripe = new Stripe(stripeSecretKey);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'TraceNode High-Res Vector SVG',
                description: `Vectorized output for ${mode.toUpperCase()} application.`,
              },
              unit_amount: 199, // $1.99 in cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        client_reference_id: conversionId,
        success_url: `${siteUrl}/?success=true&session_id={CHECKOUT_SESSION_ID}&conversion_id=${conversionId}`,
        cancel_url: `${siteUrl}/?canceled=true`,
      });

      // Update session ID if possible
      if (isMockMode) {
        mockDb.update(conversionId, { stripe_session_id: session.id });
      } else {
        await supabase
          .from('conversions')
          .update({ stripe_session_id: session.id })
          .eq('id', conversionId);
      }

      return NextResponse.json({ url: session.url });
    }
  } catch (error: any) {
    console.error('[API/Checkout] Error during checkout session creation:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
