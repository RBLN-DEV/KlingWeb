# Documentação da API Kling AI

Este documento detalha a API da Kling AI, incluindo capacidades dos modelos, endpoints disponíveis, parâmetros e cenários de uso. O conteúdo foi consolidado a partir do arquivo de referência fornecido.

## 1. Mapa de Capacidades (Capability Map)

### 1.1 Modelos de Geração de Vídeo

| Modelo | Modo | Resolução | Frame Rate | Duração STD | Duração PRO |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **kling-v1** | STD / PRO | 720p / 1080p | 30fps | 5s | 5s |
| **kling-v1-5** | STD / PRO | 720p / 1080p | 30fps | 5s / 10s | 5s / 10s |
| **kling-v1-6** | STD / PRO | 720p / 1080p | 24fps | 5s / 10s | 5s / 10s |
| **kling-v2 Master** | - | 720p | 24fps | - | - |
| **kling-v2-1** | STD / PRO | 720p / 1080p | 24fps | 5s / 10s | 5s / 10s |
| **kling-v2-5** | PRO | 1080p | 24fps | - | - |
| **kling-v2-6** | STD / PRO | - | - | 5s / 10s | 5s / 10s |

### 1.2 Recursos por Modelo

| Recurso | kling-v1 | kling-v1-5 | kling-v1-6 | kling-v2-1 | kling-v2-5 | kling-v2-6 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Text to Video | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Image to Video | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Camera Control | ✅ | Simples | - | - | - | - |
| Motion Brush | ✅ | ✅ | - | - | - | - |
| Start/End Frame | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (No Audio) |
| Video Extension | ✅ | ✅ | ✅ | - | - | - |
| Video Effects | ✅ | ✅ | ✅ | - | - | - |
| Voice Control | - | - | - | - | - | ✅ |

### 1.3 Modelos de Geração de Imagem

| Modelo | Text to Image | Image to Image | Resoluções Suportadas |
| :--- | :---: | :---: | :--- |
| **kling-image-o1** | ✅ | ✅ | 1:1, 16:9, 4:3, 3:2, 2:3, 3:4, 9:16, 21:9, auto |
| **kling-v1** | ✅ | ✅ | 1:1, 16:9, 4:3, 3:2, 2:3, 3:4, 9:16, 21:9 |
| **kling-v1-5** | ✅ | ✅ | 1:1, 16:9, 4:3, 3:2, 2:3, 3:4, 9:16, 21:9 |
| **kling-v2** | ✅ | ✅ | 1:1, 16:9, 4:3, 3:2, 2:3, 3:4, 9:16, 21:9 |
| **kling-v2-1** | ✅ | ✅ | 1:1, 16:9, 4:3, 3:2, 2:3, 3:4, 9:16, 21:9 |

---

## 2. Endpoints da API

A URL base para os exemplos é `https://api-singapore.klingai.com` (note que pode variar conforme a região).

### 2.1 Omni-Video (O1)

Modelo capaz de gerar vídeos a partir de prompts complexos envolvendo imagens, vídeos e elementos.

#### Criar Tarefa (Create Task)
*   **URL:** `/v1/videos/omni-video`
*   **Método:** `POST`
*   **Content-Type:** `application/json`

**Corpo da Requisição (Main Fields):**

| Campo | Tipo | Obrigatório | Descrição |
| :--- | :--- | :--- | :--- |
| `model_name` | string | Opcional | Padrão: `kling-video-o1`. |
| `prompt` | string | Obrigatório | Texto do prompt (max 2500 chars). Pode referenciar elementos (`<<<element_1>>>`), imagens (`<<<image_1>>>`) ou vídeos. |
| `image_list` | array | Opcional | Lista de imagens de referência. |
| `element_list` | array | Opcional | Lista de IDs de elementos. |
| `video_list` | array | Opcional | Lista de vídeos de referência. |
| `mode` | string | Opcional | `std` (padrão) ou `pro` (profissional). |
| `aspect_ratio` | string | Opcional | `16:9`, `9:16`, `1:1`. Requerido se não houver referência de vídeo/frame. |
| `duration` | string | Opcional | `5` ou `10` (segundos). |
| `callback_url` | string | Opcional | URL para webhook de notificação. |

**Exemplo de Prompt Omni:**
```json
"prompt": "<<<image_1>>> strolling through the streets of Tokyo, encountered <<<element_1>>> and <<<element_2>>>..."
```

#### Consultar Tarefa (Query Task - Single)
*   **URL:** `/v1/videos/omni-video/{id}`
*   **Método:** `GET`

#### Consultar Tarefas (Query Task - List)
*   **URL:** `/v1/videos/omni-video`
*   **Método:** `GET`
*   **Parâmetros:** `pageNum`, `pageSize`

---

### 2.2 Geração de Vídeo: Texto para Vídeo (Text to Video)

#### Criar Tarefa
*   **URL:** `/v1/videos/text2video`
*   **Método:** `POST`

**Principais Campos:**

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `model_name` | string | Ex: `kling-v1`, `kling-v1-6`, `kling-v2-5-turbo`, etc. |
| `prompt` | string | Prompt positivo (max 2500 chars). |
| `negative_prompt` | string | Prompt negativo. |
| `sound` | string | `on` / `off` (Apenas v2.6+). |
| `cfg_scale` | float | Escala de fidelidade ao prompt (0-1). |
| `mode` | string | `std` ou `pro`. |
| `camera_control` | object | Controle de câmera (`type`, `config` com `horizontal`, `zoom`, etc.). |
| `aspect_ratio` | string | `16:9`, `9:16`, `1:1`. |
| `duration` | string | `5` ou `10`. |

#### Consultar Tarefa
*   **Single:** `GET /v1/videos/text2video/{id}`
*   **List:** `GET /v1/videos/text2video`

---

### 2.3 Geração de Vídeo: Imagem para Vídeo (Image to Video)

#### Criar Tarefa
*   **URL:** `/v1/videos/image2video`
*   **Método:** `POST`

**Principais Campos:**

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `model_name` | string | Ex: `kling-v1`. |
| `image` | string | Imagem base (URL ou Base64). |
| `image_tail` | string | Imagem do último frame (opcional). |
| `prompt` | string | Prompt de texto opcional. |
| `voice_list` | array | Lista de vozes (TTS) para acompanhar o vídeo (v2.6+). |
| `static_mask` | string | Máscara estática (URL/Base64) para Motion Brush. |
| `dynamic_masks` | array | Máscaras dinâmicas e trajetórias. |
| `camera_control` | object | Configuração de movimento de câmera. |

**Nota:** Parâmetros `image+image_tail`, `masks` e `camera_control` muitas vezes são mutuamente exclusivos ou dependentes do modelo.

#### Consultar Tarefa
*   **Single:** `GET /v1/videos/image2video/{id}`
*   **List:** `GET /v1/videos/image2video`

---

### 2.4 Controle de Movimento (Motion Control)

Gera vídeos onde o movimento do personagem segue um vídeo de referência.

#### Criar Tarefa
*   **URL:** `/v1/videos/motion-control`
*   **Método:** `POST`

**Campos Obrigatórios:**
*   `image_url`: Imagem do personagem.
*   `video_url`: Vídeo de referência de movimento.
*   `character_orientation`: `image` (segue orientação da foto) ou `video` (segue orientação do vídeo).
*   `mode`: `std` ou `pro`.

Use `prompt` opcional para descrever a cena.

#### Consultar Tarefa
*   **Single:** `GET /v1/videos/motion-control/{id}`
*   **List:** `GET /v1/videos/motion-control`

---

### 2.5 Efeitos de Vídeo (Video Effects)

Cria vídeos com efeitos predefinidos (ex: "hug", "kiss", "dance").

#### Criar Tarefa
*   **URL:** `/v1/videos/effects`
*   **Método:** `POST`

**Campos:**
*   `effect_scene`: Nome do efeito (ex: `pet_lion`, `hug`, `fight_pro`). Consulte a lista completa na documentação original (mais de 200 efeitos).
*   `input`: Objeto contendo os dados do efeito.
    *   Para **Single Image Effect**: `{ "image": "url", "duration": "5" }`
    *   Para **Dual-character Effect**: `{ "images": ["url1", "url2"], "duration": "5" }`

#### Consultar Tarefa
*   **Single:** `GET /v1/videos/effects/{id}`
*   **List:** `GET /v1/videos/effects` (Nota: Path parameter na doc original estava como `image2video` por engano no exemplo de lista, mas o endpoint correto deve ser `effects`).

---

### 2.6 Elementos (Elements)

Gerenciamento de elementos personalizados para uso no Omni-Video.

*   **Criar Elemento Personalizado:** `POST /v1/general/custom-elements`
    *   Requer `element_name`, `element_description`, `element_frontal_image` e `element_refer_list` (múltiplos ângulos).
*   **Listar Elementos Personalizados:** `GET /v1/general/custom-elements`
*   **Listar Elementos Predefinidos:** `GET /v1/general/presets-elements`
*   **Deletar Elemento:** `POST /v1/general/delete-elements` (`element_id`).

---

## 3. Descrição de Recursos Avançados

### 3.1 Modos de Geração
*   **Modo Padrão (Standard):** Otimizado para velocidade e prototipagem. Custo-benefício.
*   **Modo Profissional (Pro):** Focado em alta qualidade, detalhes refinados e melhor fidelidade visual. Ideal para uso comercial.

### 3.2 Extensão de Vídeo
É possível estender vídeos existentes fornecendo o vídeo anterior como referência e usando prompts como "generate the next shot".

### 3.3 Motion Brush (Pincel de Movimento)
Permite ao usuário pintar áreas específicas de uma imagem para definir onde o movimento deve ocorrer (máscara estática) ou definir trajetórias para objetos (máscara dinâmica).

### 3.4 Camera Control & Movimento
Controle fino sobre a câmera virtual:
*   Panorâmica (Pan)
*   Inclinação (Tilt)
*   Zoom
*   Movimento Horizontal/Vertical
*   Presets como "Simple", "Down Back", "Forward Up".

### 3.5 Lip Sync (Sincronização Labial)
Sincroniza o movimento dos lábios de personagens humanos com faixas de áudio (geradas ou upload).

---

## 4. Cenários de Aplicação

A API Kling é ideal para diversos cenários criativos e comerciais:

1.  **Curtas-metragens:** Narrativas cinematográficas complexas e emotional storytelling.
2.  **Publicidade Comercial:** Demonstrações de produtos, anúncios de TV/Social, marketing visual.
3.  **Shorts Criativos:** Arte experimental, poesia visual.
4.  **Vídeo Musical (MV):** Visualizers, sincronia com batidas, clipes artísticos.
5.  **Animais e Natureza:** Animação realista de pets e vida selvagem.
6.  **Realidade e Documentários:** Recriação de cenas realistas e históricas.
7.  **Ficção Científica:** Mundos futuristas e tecnologia.
8.  **Charme Oriental:** Estética cultural asiática e tradicional.

---
*Documento gerado automaticamente com base no arquivo `API CALLS KLING.txt`.*
