import os
import random
from typing import Literal

import httpx

OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
FREE_MODELS = [
    'meta-llama/llama-3.2-3b-instruct:free',
    'meta-llama/llama-3.1-8b-instruct:free',
    'google/gemma-2-9b-it:free',
    'mistralai/mistral-7b-instruct:free',
]
PAID_MODEL = 'deepseek/deepseek-chat'

Topic = Literal['daily_life', 'work', 'hobbies', 'free_chat']

TOPIC_PROMPTS: dict[Topic, str] = {
    'daily_life': 'Пиши о повседневных делах: покупки, еда, погода, планы на вечер, домашние дела.',
    'work': 'Пиши о рабочих вопросах: задачи, проекты, встречи, коллеги, дедлайны.',
    'hobbies': 'Пиши о хобби: спорт, кино, музыка, игры, путешествия, книги.',
    'free_chat': 'Пиши свободно: шутки, мемы, случайные мысли, лёгкое общение.',
}

SYSTEM_PROMPT_TEMPLATE = """Ты — обычный человек в Telegram. Пишешь другу короткое сообщение.
Правила:
- Длина 1-2 предложения максимум
- Разговорный стиль, без пунктуации в конце если не нужна
- Иногда с опечатками или сокращениями (не всегда)
- На русском языке
- БЕЗ кавычек, БЕЗ пояснений — только само сообщение
- Тема: {topic_hint}
- Контекст диалога (если есть): {context}
"""


class AIClient:
    def __init__(self):
        self.api_key = os.environ.get('OPENROUTER_API_KEY', '').strip()
        self.use_paid = os.environ.get('AI_USE_PAID_MODEL', '0') == '1'

    def _get_model(self) -> str:
        if self.use_paid:
            return PAID_MODEL
        return random.choice(FREE_MODELS)

    async def generate_message(
        self,
        topics: list[Topic],
        context: list[str] | None = None,
        is_reply: bool = False,
    ) -> str:
        topic = random.choice(topics) if topics else 'daily_life'
        topic_hint = TOPIC_PROMPTS.get(topic, TOPIC_PROMPTS['daily_life'])
        context_str = '\n'.join(context[-4:]) if context else 'начало диалога'

        if is_reply and context:
            user_prompt = f'Ответь на последнее сообщение: {context[-1]}'
        else:
            user_prompt = 'Напиши следующее сообщение в диалоге.'

        if not self.api_key:
            return self._fallback_message(topic)

        payload = {
            'model': self._get_model(),
            'messages': [
                {
                    'role': 'system',
                    'content': SYSTEM_PROMPT_TEMPLATE.format(
                        topic_hint=topic_hint,
                        context=context_str,
                    ),
                },
                {
                    'role': 'user',
                    'content': user_prompt,
                },
            ],
            'max_tokens': 80,
            'temperature': 0.9,
        }

        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.post(
                    f'{OPENROUTER_BASE}/chat/completions',
                    headers={
                        'Authorization': f'Bearer {self.api_key}',
                        'HTTP-Referer': 'https://warmup-saas.pages.dev',
                        'X-Title': 'Varmup',
                        'Content-Type': 'application/json',
                    },
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
            return self._fallback_message(topic)

        message = str(data['choices'][0]['message']['content']).strip().strip('"\'')
        return message or self._fallback_message(topic)

    def _fallback_message(self, topic: Topic) -> str:
        fallbacks = {
            'daily_life': [
                'Привет! Как дела?',
                'Что делаешь?',
                'Давно не писали',
                'Всё норм у тебя?',
            ],
            'work': [
                'Как там с проектом?',
                'Успеваешь по дедлайну?',
                'Много работы сейчас?',
            ],
            'hobbies': [
                'Что смотришь сейчас?',
                'Играешь во что-нибудь?',
                'Как прошли выходные?',
            ],
            'free_chat': [
                'Привет',
                'О, привет!',
                'Ну как оно?',
                'Привет, давно не виделись',
            ],
        }
        return random.choice(fallbacks.get(topic, fallbacks['free_chat']))
