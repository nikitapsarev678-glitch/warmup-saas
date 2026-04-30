import dynamic from 'next/dynamic'

import { CtaSection } from '@/components/landing/cta'
import { FeaturesSection } from '@/components/landing/features'
import { FaqSection } from '@/components/landing/faq'
import { Footer } from '@/components/landing/footer'
import { Header } from '@/components/landing/header'
import { HeroSection } from '@/components/landing/hero'
import { MiniWidgetsRail } from '@/components/landing/mini-widgets-rail'
import { PricingSection } from '@/components/landing/pricing'
import { StatsSection } from '@/components/landing/stats'

const belowFoldFallback = <div className="section-padding" aria-hidden="true" />

const DuckWorkflowScroll = dynamic(
  () => import('@/components/landing/duck-workflow-scroll').then((module) => module.DuckWorkflowScroll),
  { loading: () => belowFoldFallback }
)

const ScrollyHowItWorks = dynamic(
  () => import('@/components/landing/scrolly-how-it-works').then((module) => module.ScrollyHowItWorks),
  { loading: () => belowFoldFallback }
)

const ScrollyBroadcast = dynamic(
  () => import('@/components/landing/scrolly-broadcast').then((module) => module.ScrollyBroadcast),
  { loading: () => belowFoldFallback }
)

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <MiniWidgetsRail />
      <main>
        <HeroSection />
        <StatsSection />
        <DuckWorkflowScroll />
        <ScrollyHowItWorks />
        <FeaturesSection />
        <ScrollyBroadcast />
        <PricingSection />
        <FaqSection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  )
}
