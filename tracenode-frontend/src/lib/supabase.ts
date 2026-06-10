import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

// Initialize real Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey);

// Fallback in-memory database mock for local testing
class InMemoryConversions {
  private conversions: Map<string, { id: string; svg_content: string; status: string; created_at: string; stripe_session_id?: string }> = new Map();

  public insert(svg_content: string, status: string = 'pending') {
    const id = 'mock-' + Math.random().toString(36).substring(2, 15) + '-' + Math.random().toString(36).substring(2, 15);
    const record = {
      id,
      svg_content,
      status,
      created_at: new Date().toISOString()
    };
    this.conversions.set(id, record);
    return record;
  }

  public update(id: string, updates: Partial<{ status: string; stripe_session_id: string }>) {
    const record = this.conversions.get(id);
    if (record) {
      const updatedRecord = { ...record, ...updates };
      this.conversions.set(id, updatedRecord);
      return updatedRecord;
    }
    return null;
  }

  public get(id: string) {
    return this.conversions.get(id) || null;
  }
}

// Global variable to persist in development
const globalForMock = global as unknown as { mockDb?: InMemoryConversions };
export const mockDb = globalForMock.mockDb ?? new InMemoryConversions();
if (process.env.NODE_ENV !== 'production') globalForMock.mockDb = mockDb;
export const isMockMode = !supabaseUrl || supabaseUrl.includes('placeholder') || !supabaseKey || supabaseKey.includes('placeholder');
export const isStripeMockMode = !process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.includes('placeholder');
