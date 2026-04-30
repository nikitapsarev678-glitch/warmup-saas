'use client'

import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

import { SectionShell } from '@/components/landing/section-shell'
import { cn } from '@/lib/utils'

const FAQ_ITEMS = [
  {
    question: 'Что такое Varmup простыми словами?',
    answer:
      'Это сервис, который помогает подготовить Telegram-аккаунты к работе и потом запускать рассылки безопаснее и удобнее. Он берёт на себя прогрев, лимиты, паузы, прокси, уведомления и контроль состояния аккаунтов.',
  },
  {
    question: 'Зачем вообще нужен прогрев аккаунтов?',
    answer:
      'Если новый аккаунт сразу начать использовать для активной рассылки, он быстрее ловит ограничения и спам-блоки. Прогрев нужен, чтобы постепенно подготовить аккаунт к рабочей нагрузке.',
  },
  {
    question: 'Что умеет сервис кроме прогрева?',
    answer:
      'Кроме прогрева, Varmup помогает импортировать аккаунты, запускать рассылки в личные сообщения и группы, работать с прокси, получать уведомления о проблемах и отслеживать, что происходит с каждым аккаунтом.',
  },
  {
    question: 'Что происходит, если аккаунт или задача ставится на паузу?',
    answer:
      'Пользователь видит не просто остановку, а понятное объяснение: что случилось, почему это произошло и что делать дальше. Например, подождать, сменить прокси или пополнить токены.',
  },
  {
    question: 'Для кого подходит Varmup?',
    answer:
      'Для арбитражников, маркетологов, SMM-команд и агентств, которым нужно работать с несколькими Telegram-аккаунтами и рассылками без ручного хаоса.',
  },
] as const

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <SectionShell
      id="faq"
      kicker="FAQ"
      title="Что за продукт и зачем он нужен"
      description="Здесь мы отвечаем простыми словами: кому нужен Varmup, зачем нужен прогрев и что именно сервис берёт на себя."
      align="center"
      contentClassName="mx-auto max-w-4xl space-y-4"
    >
      {FAQ_ITEMS.map((item, index) => {
        const isOpen = openIndex === index

        return (
          <div key={item.question} className="surface-panel-soft dashed-panel pixel-frame p-1.5 text-left">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-4 rounded-[0.88rem] px-5 py-4 text-left sm:px-6"
              onClick={() => setOpenIndex(isOpen ? null : index)}
              aria-expanded={isOpen}
            >
              <div>
                <div className="pixel-label text-[0.66rem] font-semibold">Faq node</div>
                <span className="mt-2 block text-base font-semibold sm:text-lg">{item.question}</span>
              </div>
              <ChevronDown className={cn('size-5 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
            </button>
            {isOpen ? (
              <div className="px-5 pb-5 pt-0 text-sm leading-7 text-muted-foreground sm:px-6">{item.answer}</div>
            ) : null}
          </div>
        )
      })}
    </SectionShell>
  )
}
