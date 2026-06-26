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
      name: 'reelId',
      title: 'Instagram Reel ID',
      type: 'string',
      description: 'The ID of the Instagram reel for this product (used by webhook).',
      validation: (rule) => rule.required(),
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
      name: 'makingCharges',
      title: 'Making Charges (Percentage or Flat)',
      type: 'number',
      description: 'Enter flat amount or percentage (we will calculate based on app settings).',
    }),
  ],
})
