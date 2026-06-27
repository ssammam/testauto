import { defineField, defineType } from 'sanity'

export const productReelType = defineType({
  name: 'productReel',
  title: 'Instagram Reels / Products',
  type: 'document',
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
      name: 'reelId',
      title: 'Instagram Reel ID',
      type: 'string',
      description: 'The ID of the Instagram reel for this product (used by webhook).',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Post Description',
      type: 'text',
      description: 'The description or caption of the post.',
    }),
    defineField({
      name: 'thumbnailUrl',
      title: 'Thumbnail URL',
      type: 'url',
      description: 'URL of the post thumbnail or image.',
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published At',
      type: 'datetime',
      description: 'The date and time the post was published on Instagram.',
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
    defineField({
      name: 'weightGrams',
      title: 'Weight (Grams)',
      type: 'number',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'makingChargeType',
      title: 'Making Charge Type',
      type: 'string',
      options: {
        list: [
          { title: 'Percentage (%) of Gold Value', value: 'percentage' },
          { title: 'Flat Amount (₹)', value: 'flat' },
          { title: 'Per Gram (₹/g)', value: 'per_gram' },
        ],
      },
      initialValue: 'percentage',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'makingCharges',
      title: 'Making Charges Value',
      type: 'number',
      description: 'Enter the percentage (e.g. 15 for 15%) or flat amount.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'isPriceLocked',
      title: 'Lock Price',
      type: 'boolean',
      description: 'If true, the locked price will be used instead of live calculation.',
      initialValue: false,
    }),
    defineField({
      name: 'lockedPrice',
      title: 'Locked Price (₹)',
      type: 'number',
      description: 'Fixed price to show if Price is Locked.',
    }),
    defineField({
      name: 'notes',
      title: 'Private Notes',
      type: 'text',
      description: 'Internal notes for staff (never shown to customers).',
    }),
  ],
})
