import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  text: string;
  targetLang: string;
  // Pre-translated map keyed by language code (e.g. { en: "...", ja: "...", ko: "..." }).
  // When the requested language is present here we use it directly and skip the network call.
  translations?: Record<string, string>;
  className?: string;
}

export function TranslatedText({ text, targetLang, translations, className = "" }: Props) {
  const [translated, setTranslated] = useState(text);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!text) {
      setTranslated('');
      return;
    }

    if (targetLang === 'zh') {
      setTranslated(text);
      return;
    }

    if (translations && translations[targetLang]) {
      setTranslated(translations[targetLang]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (isMounted) {
          try {
            const result = data[0].map((item: any[]) => item[0]).join('');
            setTranslated(result);
          } catch (e) {
            setTranslated(text);
          }
          setLoading(false);
        }
      })
      .catch((e) => {
        console.error("Translation failed", e);
        if (isMounted) {
          setTranslated(text);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [text, targetLang, translations]);

  if (loading) {
    return (
      <span className={`inline-flex items-center gap-1 opacity-50 ${className}`}>
        <Loader2 className="w-3 h-3 animate-spin" />
      </span>
    );
  }

  return <span className={className}>{translated}</span>;
}
