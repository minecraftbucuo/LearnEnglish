// 查询类型（词 / 句 / 中→英词 / 中→英句），供 lookup.ts 与 prompts.ts 共用
// 截图查询已并入普通查询：OCR 转文字后走这里的类型
export type LookupKind = 'word' | 'sentence' | 'zh_word' | 'zh_sentence'
