const normalizeText = (value = '') =>
  String(value || '')
    .replace(/[“”״]/g, '"')
    .replace(/[’'׳]/g, "'")
    .replace(/[–—־]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const includesAny = (text, patterns = []) => patterns.some((pattern) => pattern.test(text));

const BREEDS = [
  {
    key: 'toy_poodle',
    labels: ['פודל טוי', 'טוי פודל', 'טוי-פודל', 'toy poodle']
  },
  {
    key: 'shih_tzu',
    labels: ['שיצו', "שיצ'ו", 'שי צו', 'shih tzu', 'shihtzu']
  },
  {
    key: 'yorkshire',
    labels: ['יורקשייר', 'יורקשיר', 'יורקשר', 'יורקי', 'yorkshire']
  },
  {
    key: 'pomeranian',
    labels: ['פומרניין', 'פומרני', 'פומרניאן', 'פום', 'pomeranian']
  },
  {
    key: 'maltipoo',
    labels: ['מלטיפו', 'מלטי פו', 'maltipoo']
  },
  {
    key: 'maltese',
    labels: ['מלטז', 'מלטזי', 'maltese']
  }
];

const detectBreedKey = (text) => {
  const normalized = normalizeText(text).toLowerCase();
  for (const breed of BREEDS) {
    for (const label of breed.labels) {
      if (!label) continue;
      if (normalized.includes(label.toLowerCase())) {
        return breed.key;
      }
    }
  }
  return null;
};

const buildBreedPriceReply = (breedKey) => {
  switch (breedKey) {
    case 'toy_poodle':
      return (
        'עלות תספורת פודל טוי היא מתחילה מ-240 שקלים, המחיר עלול להשתנות בהתאם למצב הפרווה (קשרים) והתנהגות הכלב\n' +
        '\n' +
        'השירות כולל\n' +
        'ציפורניים\n' +
        'מריטת שיערות אוזניים\n' +
        'ניקוי איזורים אינטימיים\n' +
        'ניקוי שיערות כפות רגליים\n' +
        'מקלחת\n' +
        'ייבוש\n' +
        'תספורת כמובן\n' +
        'וריח טוב מובטח 💓🐶🫧'
      );
    case 'shih_tzu':
      return (
        'עלות תספורת שיצו מתחילה מ-230 שקלים והמחיר עלול להשתנות בהתאם למצב פרווה וההתנהגות\n' +
        '\n' +
        'התספורת כוללת\n' +
        'ציפורניים\n' +
        'מריטת שיערות אוזניים\n' +
        'ניקוי איזורים אינטימיים\n' +
        'ניקוי שיערות כפות רגליים\n' +
        'מקלחת\n' +
        'ייבוש\n' +
        'ותספורת כמובן'
      );
    case 'yorkshire':
      return (
        'מצויין, עלות יורקשייר מתחילה מ-230 ומשתנה בהתאם להתנהגות הכלב ולמצב הפרווה שלו (קשרים)\n' +
        '\n' +
        'התספורת כוללת:\n' +
        'ציפורניים\n' +
        'ניקוי אוזניים\n' +
        'מריטת שיערות אוזניים\n' +
        'ניקוי איזורים אינטימיים\n' +
        'ניקוי שיערות כפות רגליים\n' +
        'מקלחת\n' +
        'ייבוש\n' +
        'תספורת כמובן\n' +
        'וריח טוב מובטח 🐶💓🫧'
      );
    case 'pomeranian':
      return (
        'היי יפה שלי\n' +
        '\n' +
        'עלות טיפוח פום היא מתחילה מ-240 המחיר עלול להשתנות לפי מצב הפרווה והתנהגות הכלב\n' +
        '\n' +
        'השירות כולל\n' +
        'ציפורניים\n' +
        'ניקוי אוזניים\n' +
        'ניקוי שיערות כפות רגליים\n' +
        'מקלחת\n' +
        'ייבוש\n' +
        'עבודת מספריים\n' +
        '\n' +
        'תזכירי לי רק מתי היא הסתפרה לאחרונה ובת כמה היא'
      );
    case 'maltipoo':
      return (
        'עלות תספורת מלטיפו היא מתחילה מ-240 ועלולה להשתנות בהתאם למצב הפרווה שלה ולהתנהגות שלה\n' +
        '\n' +
        'השירות כולל\n' +
        '\n' +
        'ציפורניים\n' +
        'מריטת שיערות אוזניים\n' +
        'ניקוי איזורים אינטימיים\n' +
        'ניקוי שיערות כפות רגליים\n' +
        'מקלחת\n' +
        'ייבוש\n' +
        'ותספורת כמובן'
      );
    case 'maltese':
      return (
        'עלות תספורת מלטז היא מתחילה מ-230 שקלים המחיר עלול להשתנות בהתאם למצב הפרווה (קשרים) והתנהגות הכלב\n' +
        '\n' +
        'השירות כולל\n' +
        'ציפורניים\n' +
        'מריטת שיערות אוזניים\n' +
        'ניקוי איזורים אינטימיים\n' +
        'ניקוי שיערות כפות רגליים\n' +
        'מקלחת\n' +
        'ייבוש\n' +
        'תספורת כמובן\n' +
        'וריח טוב מובטח 💓🐶🫧'
      );
    default:
      return null;
  }
};

const buildGenericPriceReply = () =>
  [
    'בשמחה 😊 עלות תספורת מתחילה בדרך כלל מ-230–240 ש"ח (משתנה לפי גזע, מצב פרווה והתנהגות).',
    'אפשר לכתוב לי איזה גזע זה ואם יש לך תמונה, ואעדכן מחיר מדויק.'
  ].join('\n');

export const getCustomerFaqReply = (message = '') => {
  const text = normalizeText(message);
  if (!text) return null;

  // Only small dogs. No cats.
  if (/(חתול|חתולה)/u.test(text)) {
    return {
      kind: 'customer_faq_not_supported',
      intentKind: 'customer_faq_not_supported',
      text: 'כרגע אנחנו מטפלים בכלבים קטנים בלבד 😊'
    };
  }

  if (includesAny(text, [/(כלב|כלבה)/u]) && includesAny(text, [/(גדול|גדולה|בינוני|בינונית)/u])) {
    return {
      kind: 'customer_faq_small_only',
      intentKind: 'customer_faq_small_only',
      text: 'כרגע אנחנו מטפלים בכלבים קטנים בלבד 😊'
    };
  }

  const isPriceQuestion = includesAny(text, [
    /(כמה|מה)\s*(?:עולה|המחיר|מחיר|עלות)/u,
    /(מחיר|עלות)\s*(?:של|ל)/u,
    /עולה\s*\d*/u
  ]);

  if (isPriceQuestion) {
    const breedKey = detectBreedKey(text);
    const reply = breedKey ? buildBreedPriceReply(breedKey) : buildGenericPriceReply();
    if (!reply) return null;

    return {
      kind: 'customer_faq_price',
      intentKind: 'customer_faq_price',
      text: `${reply}\n\nרוצה שאבדוק תור? איזה יום ושעה נוחים לך?`
    };
  }

  if (/(שעות|שעות פעילות|מתי אתם עובדים|פתוחים|פתוח|פתוחה)/u.test(text)) {
    return {
      kind: 'customer_faq_hours',
      intentKind: 'customer_faq_hours',
      text: 'אנחנו עובדים ראשון עד שישי בבוקר (אין תורים בערב), ובשבת לא עובדים 😊'
    };
  }

  if (/(בערב|אחרי הצהריים|לילה)/u.test(text) && /(תור|אפשר|יש)/u.test(text)) {
    return {
      kind: 'customer_faq_evening',
      intentKind: 'customer_faq_evening',
      text: 'אין תורים בערב, עובדים רק בבוקר 😊'
    };
  }

  if (/(שישי|יום שישי)/u.test(text) && /(עובדים|פתוחים|תור|אפשר|יש)/u.test(text)) {
    return {
      kind: 'customer_faq_friday',
      intentKind: 'customer_faq_friday',
      text: 'ביום שישי יש תורים רק בבוקר: 07:00 או 08:00 😊'
    };
  }

  if (/(איפה|כתובת|מיקום|נמצאים)/u.test(text)) {
    return {
      kind: 'customer_faq_location',
      intentKind: 'customer_faq_location',
      text: 'אנחנו בראשון לציון. כתובת מדויקת נשלחת אחרי קביעת תור 😊'
    };
  }

  if (/(בלי\s*תור|ללא\s*תור|בלי לתאם)/u.test(text)) {
    return {
      kind: 'customer_faq_walkin',
      intentKind: 'customer_faq_walkin',
      text: 'אנחנו עובדים בתיאום מראש בלבד 😊'
    };
  }

  if (/(כמה זמן|משך|לוקח טיפול|כמה זמן זה לוקח)/u.test(text)) {
    return {
      kind: 'customer_faq_duration',
      intentKind: 'customer_faq_duration',
      text: 'בדרך כלל בין שעה לשעתיים, תלוי בכלב ובמצב הפרווה 😊'
    };
  }

  if (/(להשאיר|להישאר|מחכים|מעדכנים|מוכן)/u.test(text)) {
    return {
      kind: 'customer_faq_dropoff',
      intentKind: 'customer_faq_dropoff',
      text: 'משאירים את הכלב ואנחנו נעדכן כשהוא מוכן 😊'
    };
  }

  if (/(מקלחת|רחצה|אמבטיה)/u.test(text) && /(בלי|רק)/u.test(text) && !/(תספורת|תספורת)/u.test(text)) {
    return {
      kind: 'customer_faq_bath_only',
      intentKind: 'customer_faq_bath_only',
      text: 'כן 😊 אפשר גם מקלחת בלי תספורת. איזה גזע זה ומה המשקל בערך?'
    };
  }

  if (/(ציפורניים)/u.test(text)) {
    return {
      kind: 'customer_faq_nails',
      intentKind: 'customer_faq_nails',
      text: 'כן, עושים גם גזירת ציפורניים 😊'
    };
  }

  if (/(אוזניים)/u.test(text) && /(ניקוי|מריטה)/u.test(text)) {
    return {
      kind: 'customer_faq_ears',
      intentKind: 'customer_faq_ears',
      text: 'כן 😊 עושים ניקוי אוזניים וגם מריטת שיערות אוזניים לפי צורך.'
    };
  }

  return null;
};
