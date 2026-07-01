import { defineField, defineType } from 'sanity'

export const dailyPriceType = defineType({
  name: 'dailyPrice',
  title: 'Daily Rates',
  type: 'document',
  fields: [
    defineField({
      name: 'date',
      title: 'Date',
      type: 'date',
      validation: (rule: any) => rule.required(),
    }),
    defineField({
      name: 'goldRate18k',
      title: 'Gold Rate (18K) per Gram',
      type: 'number',
      description: 'Price per gram of 18K Gold in INR',
    }),
    defineField({
      name: 'goldRate9k',
      title: 'Gold Rate (9K) per Gram',
      type: 'number',
      description: 'Price per gram of 9K Gold in INR',
    }),
    defineField({
      name: 'goldRate22k',
      title: 'Gold Rate (22K) per Gram',
      type: 'number',
      description: 'Price per gram of 22K Gold in INR',
    }),
    defineField({
      name: 'goldRate24k',
      title: 'Gold Rate (24K) per Gram',
      type: 'number',
      description: 'Price per gram of 24K Gold in INR',
    }),
    defineField({
      name: 'silverRate',
      title: 'Silver Rate per Gram',
      type: 'number',
      description: 'Price per gram of Silver in INR',
    }),
  ],
  preview: {
    select: {
      title: 'date',
      subtitle: 'goldRate22k'
    }
  }
})
