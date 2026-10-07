import { describe, expect, it } from 'vitest'
import { fileNameFromUrl, looksLikeLink, normalizeImageLink } from '../links'
import { titleFromFileName } from '../../render/image'

const url = (input: string) => {
  const r = normalizeImageLink(input)
  if (!r.ok) throw new Error(r.error)
  return r.url
}

describe('normalizeImageLink', () => {
  it('keeps ordinary image links', () => {
    expect(url('https://upload.wikimedia.org/wikipedia/commons/a/a5/Tsunami.jpg')).toBe('https://upload.wikimedia.org/wikipedia/commons/a/a5/Tsunami.jpg')
    expect(url('http://example.com/a.png?size=large')).toBe('http://example.com/a.png?size=large')
    expect(url('https://en.wikipedia.org/wiki/Foo_(bar)')).toBe('https://en.wikipedia.org/wiki/Foo_(bar)')
  })

  it('adds a missing scheme and trims wrapping characters', () => {
    expect(url('example.com/castle.png')).toBe('https://example.com/castle.png')
    expect(url('//cdn.example.com/x.webp')).toBe('https://cdn.example.com/x.webp')
    expect(url('  <https://example.com/a.png>  ')).toBe('https://example.com/a.png')
    expect(url('"https://example.com/a.png"')).toBe('https://example.com/a.png')
    expect(url('example.com:8080/a.png')).toBe('https://example.com:8080/a.png')
  })

  it('drops the fragment', () => {
    expect(url('https://example.com/a.png#zoom')).toBe('https://example.com/a.png')
  })

  it('unwraps image-search links to the original image', () => {
    const img = 'https://images.example.org/castle.jpg?w=2000'
    const enc = encodeURIComponent(img)
    expect(url(`https://www.google.com/imgres?imgurl=${enc}&imgrefurl=https%3A%2F%2Fexample.org%2F&h=900&w=1600`)).toBe(img)
    expect(url(`https://www.google.co.uk/url?sa=i&url=${enc}`)).toBe(img)
    expect(url(`https://www.bing.com/images/search?view=detailV2&mediaurl=${enc}`)).toBe(img)
    expect(url(`https://duckduckgo.com/iu/?u=${enc}&f=1`)).toBe(img)
    expect(url(`https://yandex.ru/images/search?img_url=${enc}&pos=0`)).toBe(img)
    // Not a wrapper: left alone
    expect(url('https://www.google.com/search?q=castle')).toBe('https://www.google.com/search?q=castle')
  })

  it('accepts image data links', () => {
    const r = normalizeImageLink('data:image/png;base64,iVBORw0KGgo=')
    expect(r).toMatchObject({ ok: true, kind: 'data' })
    expect(normalizeImageLink('data:text/html,<b>hi</b>').ok).toBe(false)
  })

  it('explains what is wrong with bad input', () => {
    for (const bad of ['', '   ', 'not a link', 'ftp://example.com/a.png', 'javascript:alert(1)', 'mailto:me@example.com']) {
      const r = normalizeImageLink(bad)
      expect(r.ok, bad).toBe(false)
      if (!r.ok) expect(r.error.length).toBeGreaterThan(10)
    }
  })
})

describe('looksLikeLink', () => {
  it('spots single links worth opening on paste', () => {
    expect(looksLikeLink('https://example.com/a.png')).toBe(true)
    expect(looksLikeLink(' http://example.com/page ')).toBe(true)
    expect(looksLikeLink('data:image/png;base64,AAAA')).toBe(true)
    expect(looksLikeLink('see https://example.com/a.png')).toBe(false)
    expect(looksLikeLink('hello')).toBe(false)
  })
})

describe('names from links', () => {
  it('reads the file name', () => {
    expect(fileNameFromUrl('https://example.com/art/Moonlit%20Castle.png?x=1')).toBe('Moonlit Castle.png')
    expect(fileNameFromUrl('https://example.com/')).toBe('')
    expect(fileNameFromUrl('nope')).toBe('')
  })

  it('makes readable titles', () => {
    expect(titleFromFileName('1280px-Van_Gogh_-_Starry_Night.jpg')).toBe('Van Gogh Starry Night')
    expect(titleFromFileName('moonlit-castle.final.png')).toBe('Moonlit castle final')
    expect(titleFromFileName('castle.png?width=300')).toBe('Castle')
    expect(titleFromFileName('image.png')).toBe('Untitled palette')
  })
})
