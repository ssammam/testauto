import { defineField, defineType } from 'sanity'

export const leadType = defineType({
  name: 'lead',
  title: 'Customer Leads',
  type: 'document',
  fields: [
    defineField({
      name: 'instagramUsername',
      title: 'Instagram Username',
      type: 'string',
    }),
    defineField({
      name: 'name',
      title: 'Customer Name',
      type: 'string',
    }),
    defineField({
      name: 'phoneNumber',
      title: 'Phone Number',
      type: 'string',
    }),
    defineField({
      name: 'queryType',
      title: 'Query Type',
      type: 'string',
      options: {
        list: ['Gold', 'Silver', 'General', 'Reel Inquiry']
      }
    }),
    defineField({
      name: 'visitDate',
      title: 'Requested Visit Date',
      type: 'string',
      description: 'The raw date text requested by the customer (e.g. "tomorrow", "24th Aug")',
    }),

    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: ['New', 'Contacted', 'Visited', 'Closed']
      },
      initialValue: 'New',
    }),
    defineField({
      name: 'reportedInDailyEmail',
      title: 'Reported in Daily Email',
      type: 'boolean',
      initialValue: false,
    })
  ],
})
