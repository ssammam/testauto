import { defineField, defineType } from 'sanity'

export const faqType = defineType({
  name: 'faq',
  title: 'Dynamic FAQs',
  type: 'document',
  fields: [
    defineField({
      name: 'keyword',
      title: 'Keyword or Trigger Phrase',
      type: 'string',
      description: 'The keyword in the DM that triggers this FAQ (e.g. "location", "timings").',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'response',
      title: 'Response Text',
      type: 'text',
      description: 'The automated response to send when this keyword is detected.',
      validation: (rule) => rule.required(),
    }),
  ],
})
