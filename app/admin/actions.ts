'use server'

import { writeClient } from '@/sanity/lib/client';
import { revalidatePath } from 'next/cache';

export async function saveDailyRates(formData: FormData) {
  try {
    const gold18k = parseFloat(formData.get('goldRate18k') as string);
    const gold22k = parseFloat(formData.get('goldRate22k') as string);
    const gold24k = parseFloat(formData.get('goldRate24k') as string);
    const silver = parseFloat(formData.get('silverRate') as string);

    if (isNaN(gold18k) || isNaN(gold22k) || isNaN(gold24k) || isNaN(silver)) {
      throw new Error("Invalid rate values.");
    }

    const today = new Date().toISOString().split('T')[0];

    // Create a new daily price document
    await writeClient.create({
      _type: 'dailyPrice',
      date: today,
      goldRate18k: gold18k,
      goldRate22k: gold22k,
      goldRate24k: gold24k,
      silverRate: silver,
    });

    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error("Error saving rates:", error);
    return { success: false, error: error.message };
  }
}
