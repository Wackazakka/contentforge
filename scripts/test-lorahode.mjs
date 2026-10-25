// Er opplastet fil en Flux-LoRA? (lib/loraHode.ts)
// Kjør:  node --experimental-strip-types scripts/test-lorahode.mjs
import { grunnmodellFra, hindringForModell } from '../lib/loraHode.ts'

let ok = 0, feil = 0
const sjekk = (navn, faktisk, forventet) => {
  const likt = JSON.stringify(faktisk) === JSON.stringify(forventet)
  if (likt) ok++; else { feil++; console.log('FEIL:', navn, '\n  fikk     ', JSON.stringify(faktisk), '\n  forventet', JSON.stringify(forventet)) }
}

// Ekte nøkler fra Lars' Flux 2-modell (fal flux-2-trainer, PEFT-stil), lest av dropleten 23.10
const flux2 = ['base_model.model.double_blocks.0.img_attn.proj.lora_A.weight', 'base_model.model.double_blocks.0.img_attn.proj.lora_B.weight']
const kohyaFlux = ['lora_unet_double_blocks_0_img_attn_proj.lora_down.weight', 'lora_unet_single_blocks_3_linear1.alpha']
const diffusersFlux = ['transformer.single_transformer_blocks.0.attn.to_k.lora_A.weight', 'transformer.transformer_blocks.2.ff.net.0.proj.lora_B.weight']
const sdxl = ['lora_unet_down_blocks_1_attentions_0_proj_in.lora_down.weight', 'lora_te1_text_model_encoder_layers_0_mlp_fc1.alpha']
const sd15 = ['lora_unet_input_blocks_4_1_proj_in.lora_down.weight']

sjekk('fal Flux 2 (PEFT) er flux', grunnmodellFra(flux2), 'flux')
sjekk('kohya Flux er flux', grunnmodellFra(kohyaFlux), 'flux')
sjekk('diffusers Flux er flux', grunnmodellFra(diffusersFlux), 'flux')
sjekk('SDXL er sd', grunnmodellFra(sdxl), 'sd')
sjekk('SD 1.5 er sd', grunnmodellFra(sd15), 'sd')
sjekk('ukjente navn', grunnmodellFra(['vekt.a', 'vekt.b']), 'ukjent')

const h = (keys, ekstra = {}) => ({ safetensors: true, tensors: 276, sample_keys: keys, error: null, ...ekstra })
sjekk('Flux 2 brukbar', hindringForModell(h(flux2)), null)
sjekk('ikke safetensors avvises', !!hindringForModell(h([], { safetensors: false, tensors: 0, error: 'ikke en safetensors-fil' })), true)
sjekk('SDXL avvises med grunn', hindringForModell(h(sdxl)).includes('Stable Diffusion'), true)
sjekk('ukjent avvises', !!hindringForModell(h(['x.y', 'z.w'])), true)
sjekk('tom LoRA avvises', !!hindringForModell(h(flux2, { tensors: 1 })), true)

console.log(`${ok}/${ok + feil} sjekker ok`)
process.exit(feil ? 1 : 0)
