import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
})

export const PLANS = {
  starter: {
    name: 'Starter',
    priceId: process.env.STRIPE_PRICE_STARTER!,
    credits: 100,
    price: 29,
  },
  pro: {
    name: 'Pro',
    priceId: process.env.STRIPE_PRICE_PRO!,
    credits: 350,
    price: 79,
  },
  agency: {
    name: 'Agency',
    priceId: process.env.STRIPE_PRICE_AGENCY!,
    credits: 1000,
    price: 199,
  },
} as const

export type PlanKey = keyof typeof PLANS

export const CREDIT_COSTS = {
  video_generation: 10,
  article_generation: 1,
} as const
