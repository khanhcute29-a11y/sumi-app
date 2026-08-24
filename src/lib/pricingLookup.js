import { supabase } from './supabaseClient';

// Cache pricing data
let pricingCache = {};

export const getProductPricing = async (productId, specifications) => {
  try {
    // Build cache key from product_id + size + weight
    const cacheKey = `${productId}_${specifications?.size || ''}_${specifications?.weight_gram || ''}`;
    if (pricingCache[cacheKey]) return pricingCache[cacheKey];

    // Query product pricing table
    const { data } = await supabase
      .from('product_pricing')
      .select('*')
      .eq('product_id', productId)
      .eq('size', specifications?.size || null)
      .eq('weight_gram', specifications?.weight_gram || null)
      .single();

    if (data?.price) {
      pricingCache[cacheKey] = data.price;
      return data.price;
    }

    // Fallback to base product price
    const { data: product } = await supabase
      .from('products')
      .select('price')
      .eq('id', productId)
      .single();

    return product?.price || 0;
  } catch (err) {
    console.error('Pricing lookup error:', err);
    return 0;
  }
};

// Get available sizes/specs for a product
export const getProductSpecs = async (productId, orderType) => {
  try {
    const { data } = await supabase
      .from('product_pricing')
      .select('size,weight_gram')
      .eq('product_id', productId)
      .neq('size', null)
      .distinct();

    return data?.map(d => ({
      size: d.size,
      weight_gram: d.weight_gram,
      label: d.weight_gram ? `${d.size || 'Standard'} - ${d.weight_gram}g` : d.size
    })) || [];
  } catch (err) {
    console.error('Specs lookup error:', err);
    return [];
  }
};

// Clear cache when prices update
export const clearPricingCache = () => {
  pricingCache = {};
};
