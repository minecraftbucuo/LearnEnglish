// 查询类型（词 / 句 / 中→英词 / 中→英句 / 图），供 lookup.ts 与 prompts.ts 共用
export type LookupKind = 'word' | 'sentence' | 'zh_word' | 'zh_sentence' | 'image'
