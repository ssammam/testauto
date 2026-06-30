import { defineField, defineType } from 'sanity'

export const productReelType = defineType({
  name: 'productReel',
  title: 'Social Media Posts / Products',
  type: 'document',
  fieldsets: [
    {
      name: 'social',
      title: 'Social Media & Post Details',
      options: { collapsible: true, collapsed: true }
    },
    {
      name: 'pricing',
      title: 'Pricing & Calculation',
      options: { collapsible: true, collapsed: false }
    }
  ],
  fields: [
    defineField({
      name: 'name',
      title: 'Product Name',
      type: 'string',
    }),
    defineField({
      name: 'sku',
      title: 'SKU / Product ID',
      type: 'string',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          { title: '🟢 Active', value: 'active' },
          { title: '🟡 Draft', value: 'draft' },
          { title: '🔴 Sold Out', value: 'sold' },
          { title: '⚫ Hidden', value: 'hidden' },
        ],
      },
      initialValue: 'active',
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {
        list: [
          { title: 'Rings', value: 'rings' },
          { title: 'Chains', value: 'chains' },
          { title: 'Bangles', value: 'bangles' },
          { title: 'Necklaces', value: 'necklaces' },
          { title: 'Earrings', value: 'earrings' },
          { title: 'Pendants', value: 'pendants' },
          { title: 'Bridal', value: 'bridal' },
          { title: 'Temple Jewellery', value: 'temple' },
          { title: 'Silver', value: 'silver' },
        ],
      },
    }),
    defineField({
      name: 'materialType',
      title: 'Material Type',
      type: 'string',
      options: {
        list: [
          { title: '18K Gold', value: 'gold18k' },
          { title: '22K Gold', value: 'gold22k' },
          { title: '24K Gold', value: 'gold24k' },
          { title: 'Silver', value: 'silver' },
        ],
      },
      validation: (rule) => rule.required(),
    }),
    
    // --- SOCIAL FIELDSET ---
    defineField({
      name: 'postedOn',
      title: 'Platform(s) Posted On',
      type: 'string',
      fieldset: 'social',
      options: {
        list: [
          { title: 'Instagram and Facebook', value: 'both' },
          { title: 'Instagram Only', value: 'instagram' },
          { title: 'Facebook Only', value: 'facebook' },
        ],
        layout: 'radio',
      },
      initialValue: 'both',
    }),
    defineField({
      name: 'reelId',
      title: 'Instagram Post/Reel ID',
      type: 'string',
      fieldset: 'social',
      description: 'The ID of the Instagram reel or post.',
      hidden: ({ document }) => document?.postedOn === 'facebook',
    }),
    defineField({
      name: 'fbPostId',
      title: 'Facebook Post ID',
      type: 'string',
      fieldset: 'social',
      description: 'The ID of the Facebook post.',
      hidden: ({ document }) => document?.postedOn === 'instagram',
    }),
    defineField({
      name: 'shortcode',
      title: 'Instagram Shortcode',
      type: 'string',
      fieldset: 'social',
    }),
    defineField({
      name: 'description',
      title: 'Post Description / Caption',
      type: 'text',
      fieldset: 'social',
    }),
    defineField({
      name: 'thumbnailUrl',
      title: 'Thumbnail URL',
      type: 'url',
      fieldset: 'social',
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published At',
      type: 'datetime',
      fieldset: 'social',
    }),

    // --- PRICING FIELDSET ---
    defineField({
      name: 'priceCalculationType',
      title: 'Calculation Mode (Toggle)',
      type: 'string',
      fieldset: 'pricing',
      options: {
        list: [
          { title: 'Normal (Specific Weight & Price)', value: 'normal' },
          { title: 'Range (Price Onwards)', value: 'range' },
        ],
        layout: 'radio',
      },
      initialValue: 'normal',
    }),
    defineField({
      name: 'weightGrams',
      title: 'Weight (Grams)',
      type: 'number',
      fieldset: 'pricing',
      hidden: ({ document }) => document?.priceCalculationType === 'range',
    }),
    defineField({
      name: 'minWeightGrams',
      title: 'Starting Weight (Grams)',
      type: 'number',
      fieldset: 'pricing',
      initialValue: 8,
      hidden: ({ document }) => document?.priceCalculationType !== 'range',
    }),
    defineField({
      name: 'maxWeightGrams',
      title: 'Ending Weight (Grams)',
      type: 'number',
      fieldset: 'pricing',
      hidden: ({ document }) => document?.priceCalculationType !== 'range',
    }),
    defineField({
      name: 'makingChargeType',
      title: 'Making Charge Type',
      type: 'string',
      fieldset: 'pricing',
      options: {
        list: [
          { title: 'Percentage (%)', value: 'percentage' },
          { title: 'Flat Amount (₹)', value: 'flat' },
          { title: 'Per Gram (₹/g)', value: 'per_gram' },
        ],
      },
      initialValue: 'percentage',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'wastage',
      title: 'Wastage (%)',
      type: 'number',
      fieldset: 'pricing',
      initialValue: 10,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'makingCharges',
      title: 'Making Charges Value',
      type: 'number',
      fieldset: 'pricing',
      initialValue: 0,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'isPriceLocked',
      title: 'Lock Price',
      type: 'boolean',
      fieldset: 'pricing',
      initialValue: false,
      hidden: ({ document }) => document?.priceCalculationType === 'range',
    }),
    defineField({
      name: 'lockedPrice',
      title: 'Locked Price (₹)',
      type: 'number',
      fieldset: 'pricing',
      hidden: ({ document }) => document?.priceCalculationType === 'range' || !document?.isPriceLocked,
    }),
    
    // --- NOTES ---
    defineField({
      name: 'notes',
      title: 'Private Notes',
      type: 'text',
      description: 'Internal notes for staff.',
    }),
  ],
})
