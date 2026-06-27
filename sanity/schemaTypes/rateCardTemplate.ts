import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'rateCardTemplate',
  title: 'Rate Card Template',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Template Name',
      type: 'string',
    }),
    defineField({
      name: 'backgroundImage',
      title: 'Background Image',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'textX',
      title: 'Text Block X Coordinate',
      type: 'number',
      description: 'Default X position (0 to 1080) for the rates block',
      initialValue: 140,
    }),
    defineField({
      name: 'textY',
      title: 'Text Block Y Coordinate',
      type: 'number',
      description: 'Default Y position (0 to 1920) for the rates block',
      initialValue: 850,
    }),
  ],
})
