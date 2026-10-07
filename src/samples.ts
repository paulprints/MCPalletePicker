/** Public-domain paintings bundled as sample images (via Wikimedia Commons). */
export interface Sample {
  id: string
  title: string
  artist: string
  year: string
  src: string
  thumb: string
  source: string
}

export const SAMPLES: Sample[] = [
  {
    id: 'great-wave',
    title: 'The Great Wave off Kanagawa',
    artist: 'Katsushika Hokusai',
    year: 'c. 1831',
    src: '/samples/great-wave.jpg',
    thumb: '/samples/great-wave-thumb.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Tsunami_by_hokusai_19th_century.jpg',
  },
  {
    id: 'starry-night',
    title: 'The Starry Night',
    artist: 'Vincent van Gogh',
    year: '1889',
    src: '/samples/starry-night.jpg',
    thumb: '/samples/starry-night-thumb.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg',
  },
  {
    id: 'sierra-nevada',
    title: 'Among the Sierra Nevada, California',
    artist: 'Albert Bierstadt',
    year: '1868',
    src: '/samples/sierra-nevada.jpg',
    thumb: '/samples/sierra-nevada-thumb.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Albert_Bierstadt_-_Among_the_Sierra_Nevada,_California_-_Google_Art_Project.jpg',
  },
  {
    id: 'the-kiss',
    title: 'The Kiss',
    artist: 'Gustav Klimt',
    year: '1908',
    src: '/samples/the-kiss.jpg',
    thumb: '/samples/the-kiss-thumb.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg',
  },
  {
    id: 'impression-sunrise',
    title: 'Impression, Sunrise',
    artist: 'Claude Monet',
    year: '1872',
    src: '/samples/impression-sunrise.jpg',
    thumb: '/samples/impression-sunrise-thumb.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Monet_-_Impression,_Sunrise.jpg',
  },
]
