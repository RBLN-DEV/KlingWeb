import type { PromptTemplate } from '@/types';

const STORAGE_KEY = 'klingai_custom_prompts';

/**
 * Carrega prompts customizados do localStorage
 */
export function getCustomPrompts(): PromptTemplate[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

/**
 * Salva prompts customizados no localStorage
 */
function saveCustomPrompts(prompts: PromptTemplate[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
}

/**
 * Adiciona um prompt customizado
 */
export function addCustomPrompt(prompt: Omit<PromptTemplate, 'id' | 'isCustom'>): PromptTemplate {
  const customs = getCustomPrompts();
  const newPrompt: PromptTemplate = {
    ...prompt,
    id: `custom_${Date.now()}`,
    isCustom: true,
  };
  customs.unshift(newPrompt);
  saveCustomPrompts(customs);
  return newPrompt;
}

/**
 * Atualiza um prompt customizado existente
 */
export function updateCustomPrompt(id: string, updates: Partial<PromptTemplate>): boolean {
  const customs = getCustomPrompts();
  const idx = customs.findIndex(p => p.id === id);
  if (idx === -1) return false;
  customs[idx] = { ...customs[idx], ...updates };
  saveCustomPrompts(customs);
  return true;
}

/**
 * Remove um prompt customizado
 */
export function deleteCustomPrompt(id: string): boolean {
  const customs = getCustomPrompts();
  const filtered = customs.filter(p => p.id !== id);
  if (filtered.length === customs.length) return false;
  saveCustomPrompts(filtered);
  return true;
}

/**
 * Retorna todos os prompts (built-in + customizados)
 */
export function getAllPrompts(): PromptTemplate[] {
  return [...getCustomPrompts(), ...PROMPT_TEMPLATES];
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: '1',
    title: 'Mulher com Vestido Bege',
    description: 'Retrato ultra-realista de mulher com vestido bege em ambiente interno',
    category: 'fashion',
    tags: ['retrato', 'moda', 'feminino', 'realista'],
    previewUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=600&fit=crop',
    prompt: `Ultra-realistic, hyper-realistic cinematic photograph.
Shot on RED Komodo 6K S35 DSMC3, Super35 CMOS sensor (19.9MP, global shutter), native 6144×3240, upscaled to 8K UHD (7680×4320), 16+ stops dynamic range, REDCODE RAW R3D, Apple ProRes 422 HQ.

Lens: Canon RF 24-70mm f/2.8L IS USM, focal ~50mm, aperture f/4, ISO 800 native, shutter 1/200s.

Subject:
Young adult woman (clearly over 18), very fair/light skin with warm undertones, realistic skin texture with visible pores and subtle imperfections. Natural curves with pronounced hips and thighs, realistic anatomy and weight distribution.

Wardrobe:
Fitted beige/nude bodycon dress, smooth fabric following the body naturally, realistic fabric tension and folds.

Lighting:
Warm indoor lighting with soft tungsten tones, gentle highlights on skin and fabric, smooth falloff shadows, balanced exposure. No harsh light, no blown highlights.

Environment:
Minimal indoor setting with warm neutral walls and wooden floor, shallow depth of field, background softly out of focus but realistic.

Face & hair:
Long blonde hair with soft waves, individual strands visible, natural volume. Subtle makeup, soft blush, defined lips, realistic eye reflections with natural catchlights.

Quality & realism:
Extreme photorealism, no AI artifacts, no plastic or wax skin, no over-smoothing. Perfect anatomy, accurate proportions, cinematic color grading, looks indistinguishable from a real professional 8K photograph.`,
  },
  {
    id: '2',
    title: 'Mulher com Bodiesuit Preto',
    description: 'Retrato em ambiente interno com iluminação azulada',
    category: 'fashion',
    tags: ['retrato', 'moda', 'feminino', 'moderno'],
    previewUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&h=600&fit=crop',
    prompt: `Ultra-realistic, hyper-realistic cinematic photograph.
Shot on RED Komodo 6K S35 DSMC3, Super35 CMOS sensor, global shutter, upscaled to 8K UHD (7680×4320), 16+ stops dynamic range, REDCODE RAW R3D, ProRes 422 HQ.

Lens: Canon RF 24-70mm f/2.8L, ~35mm, f/4, ISO 800, shutter 1/200s.

Scene:
Young adult woman (clearly over 18), very fair light skin with natural pink undertones, real skin texture with visible pores and subtle imperfections. Natural body proportions, thick thighs, soft curves, realistic weight distribution.

Wearing a black long-sleeve bodysuit, standing indoors in a modern apartment living room. Relaxed, confident posture, hips slightly angled, one arm near the hip.

Camera & framing:
Medium-low angle, camera slightly below chest level, close perspective, vertical 9:16, subject centered, natural lens distortion.

Lighting:
Cool bluish ambient lighting, soft LED tones creating subtle blue/violet reflections on skin and fabric. Balanced shadows, no harsh highlights.

Details:
Long straight dark brown hair with visible individual strands, natural makeup, soft lips, realistic eye reflections. Background slightly out of focus with visible interior elements (AC unit, neutral walls, dark floor).

Extreme realism, perfect anatomy, no AI artifacts, no plastic skin, cinematic color grading, indistinguishable from a real 8K photograph.`,
  },
  {
    id: '3',
    title: 'Mulher Loira com Short',
    description: 'Retrato ao ar livre com roupa esportiva',
    category: 'fashion',
    tags: ['retrato', 'esporte', 'feminino', 'outdoor'],
    previewUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&h=600&fit=crop',
    prompt: `Ultra-realistic, hyper-realistic cinematic photograph.
Shot on RED Komodo 6K S35 DSMC3, Super35 CMOS sensor, global shutter, upscaled to 8K UHD (7680×4320), 16+ stops dynamic range, REDCODE RAW R3D, ProRes 422 HQ.

Lens: Canon RF 24-70mm f/2.8L, ~35mm, f/4, ISO 800, shutter 1/200s.

Scene:
Young adult blonde woman (clearly over 18), very fair light skin with warm undertones, real skin texture with visible pores and subtle imperfections. Natural body proportions, fit body, realistic weight distribution.

Wearing a white cropped t-shirt with Corinthians football team logo and light blue denim shorts, standing outdoors in a covered patio area. Dancing pose, energetic movement, confident expression.

Camera & framing:
Medium angle, camera at chest level, vertical 9:16, subject centered, natural lens distortion.

Lighting:
Natural daylight, soft shadows, warm tones, balanced exposure. No harsh light, no blown highlights.

Details:
Long blonde wavy hair with visible individual strands, natural makeup, soft blush, defined lips, realistic eye reflections. Background showing outdoor patio with plants and tiled floor.

Extreme realism, perfect anatomy, no AI artifacts, no plastic skin, cinematic color grading, indistinguishable from a real 8K photograph.`,
  },
  {
    id: '4',
    title: 'Retrato Profissional Masculino',
    description: 'Retrato corporativo de homem em ambiente de escritório',
    category: 'portraits',
    tags: ['retrato', 'corporativo', 'masculino', 'profissional'],
    previewUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=600&fit=crop',
    prompt: `Ultra-realistic professional corporate headshot.
Shot on Sony A7R V, 61MP full-frame sensor, 8K video capability, 15+ stops dynamic range.

Lens: Sony FE 85mm f/1.4 GM, aperture f/2.8, ISO 400, shutter 1/160s.

Subject:
Professional man in his 30s, confident expression, well-groomed beard, short dark hair. Natural skin texture with visible pores, realistic skin tones.

Wardrobe:
Navy blue tailored suit, white dress shirt, subtle pattern tie. Perfect fit, professional appearance.

Lighting:
Soft studio lighting with key light and fill, gentle shadows defining facial features, catchlights in eyes. Clean, even exposure.

Environment:
Modern office background with blurred city view through window, shallow depth of field, professional corporate setting.

Quality:
Extreme photorealism, sharp focus on eyes, cinematic color grading, indistinguishable from professional photography.`,
  },
  {
    id: '5',
    title: 'Paisagem Natural',
    description: 'Paisagem de montanhas com luz dourada do pôr do sol',
    category: 'nature',
    tags: ['paisagem', 'natureza', 'montanhas', 'pôr do sol'],
    previewUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=600&fit=crop',
    prompt: `Ultra-realistic landscape photography.
Shot on Phase One XF IQ4 150MP, medium format digital back.

Lens: Schneider Kreuznach 35mm LS f/3.5, aperture f/11, ISO 50, shutter 1/30s with tripod.

Scene:
Majestic mountain range at golden hour, dramatic peaks with snow caps, layered mountain ridges fading into atmospheric perspective. Alpine lake in foreground reflecting the peaks.

Lighting:
Golden hour sunlight casting warm orange and pink tones across the landscape, long shadows, dramatic cloud formations catching the light.

Atmosphere:
Misty valleys between peaks, crystal clear air in upper atmosphere, sense of vast scale and natural beauty.

Quality:
Extreme detail in every element, 16-bit color depth, professional color grading, award-winning landscape photography quality.`,
  },
  {
    id: '6',
    title: 'Cena Urbana Noturna',
    description: 'Rua da cidade à noite com luzes de neon',
    category: 'urban',
    tags: ['urbano', 'noite', 'cidade', 'neon'],
    previewUrl: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=400&h=600&fit=crop',
    prompt: `Ultra-realistic urban night photography.
Shot on Sony A7S III, 12.1MP full-frame optimized for low light, dual native ISO.

Lens: Sony FE 24mm f/1.4 GM, aperture f/1.4, ISO 3200, shutter 1/60s.

Scene:
Rainy Tokyo street at night, neon signs reflecting on wet pavement, bustling urban atmosphere. Steam rising from street vents, people with umbrellas walking.

Lighting:
Vibrant neon colors - pinks, blues, purples - illuminating the scene, contrast between warm and cool tones, reflections creating depth.

Details:
Rain droplets on surfaces, motion blur on passing cars, sharp focus on foreground elements, atmospheric haze from humidity.

Quality:
Cinematic color grading, extreme low-light performance, no noise despite high ISO, blade runner aesthetic with photorealistic detail.`,
  },
  {
    id: '7',
    title: 'Arte Abstrata',
    description: 'Composição abstrata com formas fluidas e cores vibrantes',
    category: 'abstract',
    tags: ['abstrato', 'arte', 'colorido', 'moderno'],
    previewUrl: 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=400&h=600&fit=crop',
    prompt: `Ultra-high resolution abstract digital art.
Created with professional 3D rendering software, 8K output.

Style:
Fluid abstract forms, organic shapes flowing and merging, smooth gradients transitioning between colors. Glass-like surfaces with caustic light effects.

Colors:
Vibrant palette of deep purples, electric blues, hot pinks, and gold accents. Harmonious color relationships with high contrast focal points.

Composition:
Dynamic movement through the frame, leading lines created by flowing forms, balanced asymmetry, depth through layering.

Lighting:
Dramatic rim lighting, internal glow effects, caustics and refractions, volumetric light rays.

Quality:
8K resolution with infinite detail, print-ready quality, gallery-worthy abstract art, smooth gradients without banding.`,
  },
  {
    id: '8',
    title: 'Produto de Luxo',
    description: 'Fotografia de produto com iluminação sofisticada',
    category: 'fashion',
    tags: ['produto', 'luxo', 'comercial', 'estúdio'],
    previewUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=600&fit=crop',
    prompt: `Ultra-realistic product photography.
Shot on Hasselblad H6D-100c, 100MP medium format.

Lens: HC Macro 120mm f/4, aperture f/8, ISO 100, shutter 1/125s with studio strobes.

Subject:
Luxury watch on black reflective surface, every detail perfectly captured - brushed metal, sapphire crystal, leather strap texture.

Lighting:
Professional studio setup with softboxes creating perfect highlights, gradient reflections on the metal surfaces, controlled shadows for dimension.

Environment:
Minimal black background, infinity curve, subtle gradient. Product is hero, no distractions.

Details:
Microscopic detail visible - machining marks on metal, stitching on leather, anti-reflective coating on crystal, engraved text sharp and readable.

Quality:
Commercial advertising quality, ready for billboard print, extreme sharpness throughout, perfect color accuracy.`,
  },
  // CATEGORIA SENSUAL
  {
    id: '9',
    title: 'Mulher Lingerie Preta',
    description: 'Retrato sensual em ambiente de quarto com iluminação quente',
    category: 'sensual',
    tags: ['sensual', 'lingerie', 'feminino', 'boudoir'],
    previewUrl: '',
    prompt: `Ultra-realistic, hyper-realistic cinematic photograph.
Shot on RED Komodo 6K S35 DSMC3, Super35 CMOS sensor, global shutter, upscaled to 8K UHD (7680×4320), 16+ stops dynamic range.

Lens: Canon RF 50mm f/1.2L, aperture f/2, ISO 800, shutter 1/160s.

Subject:
Young adult woman (clearly over 18), olive skin with warm undertones, real skin texture with visible pores and subtle imperfections. Natural body proportions, soft curves, realistic anatomy.

Wearing elegant black lace lingerie, intricate floral pattern, delicate straps. Sitting on bed with silk sheets.

Pose & Expression:
Relaxed sensual pose, one hand near hair, soft confident expression, direct eye contact with camera.

Lighting:
Warm tungsten bedroom lighting, soft golden tones, gentle shadows, intimate atmosphere. Window light creating soft rim lighting.

Environment:
Luxury bedroom, soft focus background with warm neutral tones, silk pillows, romantic atmosphere.

Details:
Long dark wavy hair cascading over shoulders, natural makeup with soft smokey eyes, realistic skin shine, individual eyelashes visible.

Extreme photorealism, perfect anatomy, no AI artifacts, no plastic skin, cinematic color grading, indistinguishable from a real 8K photograph.`,
  },
  {
    id: '10',
    title: 'Mulher Vestido Vermelho',
    description: 'Retrato elegante com vestido vermelho justo',
    category: 'sensual',
    tags: ['sensual', 'vestido', 'feminino', 'elegante'],
    previewUrl: '',
    prompt: `Ultra-realistic, hyper-realistic cinematic photograph.
Shot on ARRI Alexa Mini LF, full-frame sensor, 4.5K resolution upscaled to 8K UHD (7680×4320), 14+ stops dynamic range.

Lens: Zeiss Supreme Prime 65mm T1.5, aperture T2, ISO 800, shutter 1/100s.

Subject:
Young adult woman (clearly over 18), tan/medium skin with golden undertones, real skin texture with visible pores. Naturally curvy figure with pronounced hips, realistic anatomy and weight distribution.

Wearing a fitted red satin dress, deep neckline, high slit revealing leg. Elegant yet sensual styling. Standing confidently.

Pose & Expression:
Hip cocked to one side, one hand on hip, confident alluring expression, slight smile, direct eye contact.

Lighting:
Dramatic studio lighting, strong key light creating defined shadows, subtle red reflections from dress on skin. Cinematic contrast.

Environment:
Dark studio background with subtle gradient, minimal distractions, focus entirely on subject.

Details:
Long straight black hair with shine, bold red lipstick matching dress, subtle smokey eye makeup, gold earrings visible.

Extreme photorealism, perfect anatomy, no AI artifacts, no plastic skin, Hollywood-quality cinematic color grading.`,
  },
  {
    id: '11',
    title: 'Mulher Biquíni Praia',
    description: 'Retrato na praia ao pôr do sol',
    category: 'sensual',
    tags: ['sensual', 'praia', 'biquíni', 'pôr do sol'],
    previewUrl: '',
    prompt: `Ultra-realistic, hyper-realistic cinematic photograph.
Shot on RED Raptor 8K VV, Vista Vision sensor, 8K native resolution, 17+ stops dynamic range.

Lens: Canon RF 35mm f/1.4L, aperture f/2.8, ISO 400, shutter 1/500s.

Subject:
Young adult woman (clearly over 18), sun-kissed tan skin with golden undertones, real skin texture with subtle freckles on shoulders. Athletic yet curvy figure, realistic proportions.

Wearing a minimal white bikini, simple design, contrast against tan skin. Walking along the beach shoreline, water touching feet.

Pose & Expression:
Candid walking pose, hair blown by wind, genuine happy expression, looking off camera with slight smile.

Lighting:
Golden hour sunset lighting, warm orange and pink tones, soft shadows, sun creating rim lighting on hair and body. Magical golden glow.

Environment:
Tropical beach at sunset, calm ocean waves, wet sand reflecting sky colors, distant palm trees silhouettes.

Details:
Long sun-bleached blonde hair flowing in wind, minimal natural makeup, salt water droplets on skin, natural beach aesthetic.

Extreme photorealism, perfect anatomy, no AI artifacts, no plastic skin, travel photography quality with cinematic grading.`,
  },
  {
    id: '12',
    title: 'Mulher Esporte Fitness',
    description: 'Retrato fitness com roupa esportiva',
    category: 'sensual',
    tags: ['sensual', 'fitness', 'esporte', 'atlético'],
    previewUrl: '',
    prompt: `Ultra-realistic, hyper-realistic cinematic photograph.
Shot on Sony FX6, Super35 sensor, 4K upscaled to 8K UHD, 15+ stops dynamic range.

Lens: Sony FE 24-70mm f/2.8 GM II at 50mm, aperture f/3.2, ISO 640, shutter 1/200s.

Subject:
Young adult woman (clearly over 18), athletic body with visible muscle definition, light tan skin with natural glow from exercise. Strong shoulders, toned abs, defined legs.

Wearing black sports bra and matching high-waisted leggings, minimal athletic aesthetic. Holding position after workout.

Pose & Expression:
Standing confident athletic pose, hands on hips, determined expression, slight sweat visible on skin creating realistic sheen.

Lighting:
Gym lighting with dramatic overhead LEDs, hard shadows creating muscle definition, motivated fitness atmosphere.

Environment:
Modern gym setting with blurred equipment in background, dark walls, focused lighting on subject.

Details:
Hair tied in high ponytail, wireless earbuds visible, minimal gym makeup, realistic exercise glow on skin, visible veins on forearms showing workout intensity.

Extreme photorealism, perfect athletic anatomy, no AI artifacts, Nike/Adidas campaign quality photography.`,
  },
  {
    id: '13',
    title: 'Mulher Pijama Seda',
    description: 'Retrato íntimo com pijama de seda',
    category: 'sensual',
    tags: ['sensual', 'pijama', 'feminino', 'íntimo'],
    previewUrl: '',
    prompt: `Ultra-realistic, hyper-realistic cinematic photograph.
Shot on Canon EOS R5, 45MP full-frame sensor, upscaled to 8K UHD, 14+ stops dynamic range.

Lens: Canon RF 85mm f/1.2L, aperture f/1.8, ISO 800, shutter 1/125s.

Subject:
Young adult woman (clearly over 18), fair porcelain skin with natural pink undertones, real skin texture with visible pores. Soft natural curves, realistic feminine proportions.

Wearing champagne/nude colored silk pajama set, loose fitting top with buttons, matching shorts. Luxurious fabric catching light.

Pose & Expression:
Sitting on bed edge, one leg tucked, relaxed morning expression, soft serene gaze, natural unstaged feeling.

Lighting:
Soft morning window light, diffused natural daylight, gentle shadows, intimate bedroom atmosphere with warm color temperature.

Environment:
Luxury bedroom with white linen, minimalist decor, large windows with sheer curtains filtering light, aspirational lifestyle aesthetic.

Details:
Messy morning hair with natural waves, no makeup or very minimal, realistic skin texture, individual silk fabric threads visible.

Extreme photorealism, perfect anatomy, no AI artifacts, lifestyle brand campaign quality, indistinguishable from real photography.`,
  },
  {
    id: '14',
    title: 'Mulher Vestido Noite',
    description: 'Retrato glamoroso para evento noturno',
    category: 'sensual',
    tags: ['sensual', 'glamour', 'vestido', 'noite'],
    previewUrl: '',
    prompt: `Ultra-realistic, hyper-realistic cinematic photograph.
Shot on ARRI Alexa 65, large format sensor, 6.5K native upscaled to 8K UHD, 14+ stops HDR.

Lens: ARRI Signature Prime 75mm T1.8, aperture T2.5, ISO 800, shutter 1/100s.

Subject:
Young adult woman (clearly over 18), deep mocha skin with warm undertones, flawless yet realistic skin texture with natural highlights on cheekbones. Elegant figured with graceful proportions.

Wearing floor-length black sequin gown with plunging back, sophisticated red carpet styling. Diamond jewelry accents.

Pose & Expression:
Over-shoulder glance pose, elegant hand placement, mysterious confident expression, eyes catching light with natural sparkle.

Lighting:
Dramatic Hollywood two-point lighting, soft key light with subtle fill, beautiful catchlights in eyes, red carpet photocall aesthetic.

Environment:
Elegant venue backdrop with soft bokeh lights, suggesting upscale event or gala, shallow depth of field isolating subject.

Details:
Elegant updo hairstyle with face-framing pieces, dramatic evening makeup with subtle smokiness, diamond earrings catching light, perfect manicure visible.

Extreme photorealism, perfect anatomy, Vogue cover quality, no AI artifacts, editorial fashion photography standard.`,
  },
  {
    id: '15',
    title: 'Mulher Jeans e Top',
    description: 'Retrato casual sensual com look despojado',
    category: 'sensual',
    tags: ['sensual', 'casual', 'jeans', 'lifestyle'],
    previewUrl: '',
    prompt: `Ultra-realistic, hyper-realistic cinematic photograph.
Shot on RED Komodo 6K, Super35 sensor, 6K native upscaled to 8K UHD, 16+ stops dynamic range.

Lens: Canon RF 35mm f/1.4L, aperture f/2.8, ISO 640, shutter 1/200s.

Subject:
Young adult woman (clearly over 18), light tan skin with natural warm undertones, real skin texture including slight imperfections. Natural fit body with realistic curves, authentic proportions.

Wearing high-waisted vintage blue jeans, white cropped tank top, casual barefoot. Effortlessly sexy styling.

Pose & Expression:
Leaning against wall, thumbs hooked in jeans, relaxed genuine smile, approachable sexy confidence, natural body language.

Lighting:
Natural window light with some direct sun, creating warm highlights and defined shadows, golden hour interior feeling.

Environment:
Modern apartment with exposed brick wall, hardwood floors, urban loft aesthetic, lifestyle photography setting.

Details:
Natural wavy brown hair loose and flowing, minimal makeup with glowing skin, visible belly button, realistic denim wear patterns on jeans.

Extreme photorealism, perfect anatomy, lifestyle brand campaign quality, no AI artifacts, authentic candid feeling.`,
  },
  {
    id: '16',
    title: 'Mulher Robe Noite',
    description: 'Retrato íntimo com robe de seda',
    category: 'sensual',
    tags: ['sensual', 'robe', 'íntimo', 'noturno'],
    previewUrl: '',
    prompt: `Ultra-realistic, hyper-realistic cinematic photograph.
Shot on Sony A1, 50.1MP full-frame sensor, 8K video capable, 15+ stops dynamic range.

Lens: Sony FE 55mm f/1.4 ZA, aperture f/1.8, ISO 1000, shutter 1/100s.

Subject:
Young adult woman (clearly over 18), pale skin with cool undertones and subtle flush on cheeks, real skin texture with natural highlights. Soft feminine curves, elegant proportions.

Wearing deep burgundy silk robe, loosely tied, revealing subtle décolletage. Luxurious fabric with natural draping.

Pose & Expression:
Standing by window at night, looking out pensively, one hand holding robe closed, mysterious introspective expression, city lights reflecting in eyes.

Lighting:
Mixed blue city lights from window and warm interior lamp, creating dramatic color contrast, film noir aesthetic with modern sensibilities.

Environment:
High-rise apartment at night, city skyline visible through window, minimalist modern interior, moody atmospheric setting.

Details:
Hair loosely falling over shoulders, evening to night transition makeup with subtle definition, realistic silk reflections, city lights bokeh in background.

Extreme photorealism, perfect anatomy, Netflix/HBO quality cinematography, no AI artifacts, premium streaming production values.`,
  },
];

export const getPromptsByCategory = (category: string): PromptTemplate[] => {
  const all = getAllPrompts();
  if (category === 'all') return all;
  return all.filter(p => p.category === category);
};

export const getPromptById = (id: string): PromptTemplate | undefined => {
  return getAllPrompts().find(p => p.id === id);
};

export const CATEGORIES = [
  { id: 'all', label: 'Todos' },
  { id: 'portraits', label: 'Retratos' },
  { id: 'fashion', label: 'Moda' },
  { id: 'sensual', label: 'Sensual' },
  { id: 'nature', label: 'Natureza' },
  { id: 'urban', label: 'Urbano' },
  { id: 'abstract', label: 'Abstrato' },
  { id: 'custom', label: 'Personalizados' },
] as const;
