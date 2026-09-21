import { Shader, Texture, UniformGroup } from 'pixi.js'
import { buildPaletteLut, hexToRgb } from '../domain/palette'
import type { LightSource, LightingState, PaletteMode, PalettePreset, RenderPreferences } from '../domain/types'

const MAX_COLOR_RULES = 32
const MAX_LIGHTS = 32

const glVertex = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
out vec2 vLocalPosition;

layout(std140) uniform spriteLightingUniforms {
  vec4 uAmbient;
  vec4 uGlobal0;
  vec4 uGlobal1;
  vec4 uGlobal2;
  vec4 uDisplayTransform;
  vec4 uObjectRect;
  vec4 uResolution;
  vec4 uParams;
  vec4 uRuleSources[${MAX_COLOR_RULES}];
  vec4 uRuleTargets[${MAX_COLOR_RULES}];
  vec4 uLightPositions[${MAX_LIGHTS}];
  vec4 uLightColors[${MAX_LIGHTS}];
  vec4 uLightDirections[${MAX_LIGHTS}];
  vec4 uLightFalloff[${MAX_LIGHTS}];
};

void main(void)
{
    vUV = aUV;
    vLocalPosition = aPosition;
    vec2 screenPosition = aPosition * uDisplayTransform.xy + uDisplayTransform.zw;
    vec2 clipPosition = vec2(
        screenPosition.x / max(uResolution.x, 1.0) * 2.0 - 1.0,
        1.0 - screenPosition.y / max(uResolution.y, 1.0) * 2.0
    );
    gl_Position = vec4(clipPosition, 0.0, 1.0);
}
`
const glFragment = `
#version 300 es
precision highp float;

in vec2 vUV;
in vec2 vLocalPosition;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uIndexMap;
uniform sampler2D uNormalMap;
uniform sampler2D uPaletteLut;

layout(std140) uniform spriteLightingUniforms {
  vec4 uAmbient;
  vec4 uGlobal0;
  vec4 uGlobal1;
  vec4 uGlobal2;
  vec4 uDisplayTransform;
  vec4 uObjectRect;
  vec4 uResolution;
  vec4 uParams;
  vec4 uRuleSources[${MAX_COLOR_RULES}];
  vec4 uRuleTargets[${MAX_COLOR_RULES}];
  vec4 uLightPositions[${MAX_LIGHTS}];
  vec4 uLightColors[${MAX_LIGHTS}];
  vec4 uLightDirections[${MAX_LIGHTS}];
  vec4 uLightFalloff[${MAX_LIGHTS}];
};

vec3 rgb2hsv(vec3 c)
{
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c)
{
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 adjustColor(vec3 color)
{
    vec3 hsv = rgb2hsv(color);
    hsv.x = fract(hsv.x + uGlobal1.x);
    hsv.y = clamp(hsv.y * uGlobal1.y, 0.0, 1.0);
    vec3 adjusted = hsv2rgb(hsv);
    adjusted = clamp((adjusted - 0.5) * uGlobal1.w + 0.5 + uGlobal1.z, 0.0, 1.0);
    return mix(adjusted, uGlobal2.rgb, uGlobal2.a);
}

vec3 toLinear(vec3 color) { return pow(max(color, vec3(0.0)), vec3(2.2)); }
vec3 toSrgb(vec3 color) { return pow(max(color, vec3(0.0)), vec3(1.0 / 2.2)); }

void main(void)
{
    vec4 sampled = texture(uTexture, vUV);
    if (sampled.a <= 0.0001) {
        finalColor = vec4(0.0);
        return;
    }

    if (uParams.z > 0.5) {
        finalColor = sampled;
        return;
    }

    vec3 base = sampled.rgb / max(sampled.a, 0.0001);

    if (uGlobal0.x < 0.5) {
        float index = floor(texture(uIndexMap, vUV).r * 255.0 + 0.5);
        base = texture(uPaletteLut, vec2((index + 0.5) / 256.0, 0.5)).rgb;
    } else {
        for (int i = 0; i < ${MAX_COLOR_RULES}; i++) {
            vec4 sourceRule = uRuleSources[i];
            vec4 targetRule = uRuleTargets[i];
            if (targetRule.a < 0.5) continue;
            float tolerance = max(sourceRule.a, 0.001);
            float weight = 1.0 - smoothstep(tolerance * 0.78, tolerance, distance(base, sourceRule.rgb));
            base = mix(base, targetRule.rgb, weight);
        }
    }

    base = adjustColor(base);
    float alpha = sampled.a;

    if (uGlobal0.w < 0.5) {
        finalColor = vec4(base * alpha, alpha);
        return;
    }

    vec3 normalData = texture(uNormalMap, vUV).rgb * 2.0 - 1.0;
    if (uGlobal0.z > 0.5) normalData.y *= -1.0;
    vec3 normal = normalize(vec3(normalData.xy * uGlobal0.y, max(normalData.z, 0.08)));
    vec2 pixel = uObjectRect.xy + vUV * uObjectRect.zw;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec3 lightSum = toLinear(uAmbient.rgb) * uAmbient.a;

    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
        if (float(i) >= uParams.y) break;
        vec4 positionData = uLightPositions[i];
        vec4 colorData = uLightColors[i];
        vec4 directionData = uLightDirections[i];
        float lightType = positionData.z;
        vec3 lightDirection;
        float attenuation = 1.0;
        float cone = 1.0;

        if (lightType < 0.5) {
            lightDirection = normalize(vec3(-directionData.xy, 0.78));
        } else {
            vec2 delta = (positionData.xy - pixel) * vec2(aspect, 1.0);
            float distanceToLight = max(length(delta), 0.0001);
            attenuation = pow(max(1.0 - distanceToLight / max(positionData.w, 0.0001), 0.0), max(uLightFalloff[i].x, 0.1));
            lightDirection = normalize(vec3(delta, 0.7));
            if (lightType > 1.5) {
                vec2 ray = normalize(vec2(-directionData.x, -directionData.y));
                float coneDot = dot(ray, -normalize(delta));
                cone = smoothstep(directionData.w, directionData.z, coneDot);
            }
        }

        float diffuse = max(dot(normal, lightDirection), 0.0);
        vec3 lightColor = toLinear(colorData.rgb) * colorData.w;
        lightSum += lightColor * diffuse * attenuation * cone;
        if (uParams.x > 0.0) {
            vec3 halfDirection = normalize(lightDirection + vec3(0.0, 0.0, 1.0));
            float specular = pow(max(dot(normal, halfDirection), 0.0), 36.0);
            lightSum += lightColor * specular * uParams.x * attenuation * cone;
        }
    }

    finalColor = vec4(toSrgb(toLinear(base) * lightSum) * alpha, alpha);
}
`

const wgslVertex = `
struct SpriteLightingUniforms {
  uAmbient:vec4<f32>,
  uGlobal0:vec4<f32>,
  uGlobal1:vec4<f32>,
  uGlobal2:vec4<f32>,
  uDisplayTransform:vec4<f32>,
  uObjectRect:vec4<f32>,
  uResolution:vec4<f32>,
  uParams:vec4<f32>,
  uRuleSources:array<vec4<f32>, ${MAX_COLOR_RULES}>,
  uRuleTargets:array<vec4<f32>, ${MAX_COLOR_RULES}>,
  uLightPositions:array<vec4<f32>, ${MAX_LIGHTS}>,
  uLightColors:array<vec4<f32>, ${MAX_LIGHTS}>,
  uLightDirections:array<vec4<f32>, ${MAX_LIGHTS}>,
  uLightFalloff:array<vec4<f32>, ${MAX_LIGHTS}>,
}

@group(0) @binding(0) var<uniform> spriteLightingUniforms : SpriteLightingUniforms;

struct VSOutput {
  @builtin(position) position:vec4<f32>,
  @location(0) uv:vec2<f32>,
}

@vertex
fn mainVertex(@location(0) aPosition:vec2<f32>, @location(1) aUV:vec2<f32>) -> VSOutput
{
  let screenPosition = aPosition * spriteLightingUniforms.uDisplayTransform.xy + spriteLightingUniforms.uDisplayTransform.zw;
  let clipPosition = vec2<f32>(
    screenPosition.x / max(spriteLightingUniforms.uResolution.x, 1.0) * 2.0 - 1.0,
    1.0 - screenPosition.y / max(spriteLightingUniforms.uResolution.y, 1.0) * 2.0
  );
  return VSOutput(vec4<f32>(clipPosition, 0.0, 1.0), aUV);
}
`
const wgslFragment = `
struct SpriteLightingUniforms {
  uAmbient:vec4<f32>,
  uGlobal0:vec4<f32>,
  uGlobal1:vec4<f32>,
  uGlobal2:vec4<f32>,
  uDisplayTransform:vec4<f32>,
  uObjectRect:vec4<f32>,
  uResolution:vec4<f32>,
  uParams:vec4<f32>,
  uRuleSources:array<vec4<f32>, ${MAX_COLOR_RULES}>,
  uRuleTargets:array<vec4<f32>, ${MAX_COLOR_RULES}>,
  uLightPositions:array<vec4<f32>, ${MAX_LIGHTS}>,
  uLightColors:array<vec4<f32>, ${MAX_LIGHTS}>,
  uLightDirections:array<vec4<f32>, ${MAX_LIGHTS}>,
  uLightFalloff:array<vec4<f32>, ${MAX_LIGHTS}>,
}

@group(0) @binding(0) var<uniform> spriteLightingUniforms : SpriteLightingUniforms;
@group(0) @binding(1) var uTexture : texture_2d<f32>;
@group(0) @binding(2) var uTextureSampler : sampler;
@group(0) @binding(3) var uIndexMap : texture_2d<f32>;
@group(0) @binding(4) var uIndexMapSampler : sampler;
@group(0) @binding(5) var uNormalMap : texture_2d<f32>;
@group(0) @binding(6) var uNormalMapSampler : sampler;
@group(0) @binding(7) var uPaletteLut : texture_2d<f32>;
@group(0) @binding(8) var uPaletteLutSampler : sampler;

fn rgb2hsv(c:vec3<f32>) -> vec3<f32>
{
  let K = vec4<f32>(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  let p = mix(vec4<f32>(c.b, c.g, K.w, K.z), vec4<f32>(c.g, c.b, K.x, K.y), step(c.b, c.g));
  let q = mix(vec4<f32>(p.x, p.y, p.w, c.r), vec4<f32>(c.r, p.y, p.z, p.x), step(p.x, c.r));
  let d = q.x - min(q.w, q.y);
  let e = 1.0e-10;
  return vec3<f32>(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

fn hsv2rgb(c:vec3<f32>) -> vec3<f32>
{
  let K = vec4<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, vec3<f32>(0.0), vec3<f32>(1.0)), c.y);
}

fn adjustColor(color:vec3<f32>) -> vec3<f32>
{
  var hsv = rgb2hsv(color);
  hsv.x = fract(hsv.x + spriteLightingUniforms.uGlobal1.x);
  hsv.y = clamp(hsv.y * spriteLightingUniforms.uGlobal1.y, 0.0, 1.0);
  var adjusted = hsv2rgb(hsv);
  adjusted = clamp((adjusted - vec3<f32>(0.5)) * spriteLightingUniforms.uGlobal1.w + vec3<f32>(0.5) + vec3<f32>(spriteLightingUniforms.uGlobal1.z), vec3<f32>(0.0), vec3<f32>(1.0));
  return mix(adjusted, spriteLightingUniforms.uGlobal2.rgb, spriteLightingUniforms.uGlobal2.a);
}

fn toLinear(color:vec3<f32>) -> vec3<f32> { return pow(max(color, vec3<f32>(0.0)), vec3<f32>(2.2)); }
fn toSrgb(color:vec3<f32>) -> vec3<f32> { return pow(max(color, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.2)); }

@fragment
fn mainFragment(@location(0) uv:vec2<f32>) -> @location(0) vec4<f32>
{
  let sampled = textureSample(uTexture, uTextureSampler, uv);
  let normalSampleBase = textureSample(uNormalMap, uNormalMapSampler, uv).rgb;
  let indexSample = floor(textureSample(uIndexMap, uIndexMapSampler, uv).r * 255.0 + 0.5);
  let paletteSample = textureSample(uPaletteLut, uPaletteLutSampler, vec2<f32>((indexSample + 0.5) / 256.0, 0.5)).rgb;
  if (sampled.a <= 0.0001) {
    return vec4<f32>(0.0);
  }
  if (spriteLightingUniforms.uParams.z > 0.5) {
    return sampled;
  }
  var base = sampled.rgb / max(sampled.a, 0.0001);

  if (spriteLightingUniforms.uGlobal0.x < 0.5) {
    base = paletteSample;
  } else {
    for (var i:u32 = 0u; i < ${MAX_COLOR_RULES}u; i = i + 1u) {
      let sourceRule = spriteLightingUniforms.uRuleSources[i];
      let targetRule = spriteLightingUniforms.uRuleTargets[i];
      if (targetRule.a >= 0.5) {
        let tolerance = max(sourceRule.a, 0.001);
        let weight = 1.0 - smoothstep(tolerance * 0.78, tolerance, distance(base, sourceRule.rgb));
        base = mix(base, targetRule.rgb, weight);
      }
    }
  }

  base = adjustColor(base);
  let alpha = sampled.a;
  if (spriteLightingUniforms.uGlobal0.w < 0.5) {
    return vec4<f32>(base * alpha, alpha);
  }

  var normalData = normalSampleBase * 2.0 - vec3<f32>(1.0);
  if (spriteLightingUniforms.uGlobal0.z > 0.5) {
    normalData.y = -normalData.y;
  }
  let normal = normalize(vec3<f32>(normalData.xy * spriteLightingUniforms.uGlobal0.y, max(normalData.z, 0.08)));
  let pixel = spriteLightingUniforms.uObjectRect.xy + uv * spriteLightingUniforms.uObjectRect.zw;
  let aspect = spriteLightingUniforms.uResolution.x / max(spriteLightingUniforms.uResolution.y, 1.0);
  var lightSum = toLinear(spriteLightingUniforms.uAmbient.rgb) * spriteLightingUniforms.uAmbient.a;

  for (var i:u32 = 0u; i < ${MAX_LIGHTS}u; i = i + 1u) {
    if (f32(i) >= spriteLightingUniforms.uParams.y) {
      break;
    }
    let positionData = spriteLightingUniforms.uLightPositions[i];
    let colorData = spriteLightingUniforms.uLightColors[i];
    let directionData = spriteLightingUniforms.uLightDirections[i];
    var lightDirection = vec3<f32>(0.0, 0.0, 1.0);
    var attenuation = 1.0;
    var cone = 1.0;

    if (positionData.z < 0.5) {
      lightDirection = normalize(vec3<f32>(-directionData.xy, 0.78));
    } else {
      let delta = (positionData.xy - pixel) * vec2<f32>(aspect, 1.0);
      let distanceToLight = max(length(delta), 0.0001);
      attenuation = pow(max(1.0 - distanceToLight / max(positionData.w, 0.0001), 0.0), max(spriteLightingUniforms.uLightFalloff[i].x, 0.1));
      lightDirection = normalize(vec3<f32>(delta, 0.7));
      if (positionData.z > 1.5) {
        let ray = normalize(vec2<f32>(-directionData.x, -directionData.y));
        let coneDot = dot(ray, -normalize(delta));
        cone = smoothstep(directionData.w, directionData.z, coneDot);
      }
    }

    let diffuse = max(dot(normal, lightDirection), 0.0);
    let lightColor = toLinear(colorData.rgb) * colorData.w;
    lightSum += lightColor * diffuse * attenuation * cone;
    if (spriteLightingUniforms.uParams.x > 0.0) {
      let halfDirection = normalize(lightDirection + vec3<f32>(0.0, 0.0, 1.0));
      let specular = pow(max(dot(normal, halfDirection), 0.0), 36.0);
      lightSum += lightColor * specular * spriteLightingUniforms.uParams.x * attenuation * cone;
    }
  }

  return vec4<f32>(toSrgb(toLinear(base) * lightSum) * alpha, alpha);
}
`

export interface SpriteMaterialUpdate {
  paletteMode: PaletteMode
  paletteSources: string[]
  palette: PalettePreset
  lighting: LightingState
  preferences: RenderPreferences
  objectRect: [number, number, number, number]
  resolution: [number, number, number, number]
  displayTransform: [number, number, number, number]
}

function makePaletteTexture(): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 1
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = '#000000'
    context.fillRect(0, 0, 256, 1)
  }
  const texture = Texture.from(canvas)
  texture.source.style.scaleMode = 'nearest'
  texture.source.style.addressMode = 'clamp-to-edge'
  return texture
}

export class SpriteLightingMaterial {
  readonly shader: Shader
  private readonly uniformGroup: UniformGroup
  private readonly paletteTexture: Texture
  private debugMode = false

  private get uniforms(): Record<string, Float32Array> {
    return this.uniformGroup.uniforms as unknown as Record<string, Float32Array>
  }

  constructor(colorTexture: Texture, normalTexture: Texture, indexTexture: Texture) {
    this.uniformGroup = new UniformGroup(
      {
        uAmbient: { value: new Float32Array([1, 1, 1, 0.35]), type: 'vec4<f32>' },
        uGlobal0: { value: new Float32Array([0, 1, 0, 1]), type: 'vec4<f32>' },
        uGlobal1: { value: new Float32Array([0, 1, 0, 1]), type: 'vec4<f32>' },
        uGlobal2: { value: new Float32Array([1, 1, 1, 0]), type: 'vec4<f32>' },
        uDisplayTransform: { value: new Float32Array([1, 1, 0, 0]), type: 'vec4<f32>' },
        uObjectRect: { value: new Float32Array([0, 0, 1, 1]), type: 'vec4<f32>' },
        uResolution: { value: new Float32Array([1, 1, 1, 1]), type: 'vec4<f32>' },
        uParams: { value: new Float32Array([0, 0, 0, 0]), type: 'vec4<f32>' },
        uRuleSources: { value: new Float32Array(MAX_COLOR_RULES * 4), type: 'vec4<f32>', size: MAX_COLOR_RULES },
        uRuleTargets: { value: new Float32Array(MAX_COLOR_RULES * 4), type: 'vec4<f32>', size: MAX_COLOR_RULES },
        uLightPositions: { value: new Float32Array(MAX_LIGHTS * 4), type: 'vec4<f32>', size: MAX_LIGHTS },
        uLightColors: { value: new Float32Array(MAX_LIGHTS * 4), type: 'vec4<f32>', size: MAX_LIGHTS },
        uLightDirections: { value: new Float32Array(MAX_LIGHTS * 4), type: 'vec4<f32>', size: MAX_LIGHTS },
        uLightFalloff: { value: new Float32Array(MAX_LIGHTS * 4), type: 'vec4<f32>', size: MAX_LIGHTS },
      },
      { ubo: true },
    )
    this.paletteTexture = makePaletteTexture()
    this.shader = Shader.from({
      gl: {
        vertex: glVertex,
        fragment: glFragment,
      },
      gpu: {
        vertex: { source: wgslVertex, entryPoint: 'mainVertex' },
        fragment: { source: wgslFragment, entryPoint: 'mainFragment' },
      },
      resources: {
        spriteLightingUniforms: this.uniformGroup,
        uTexture: colorTexture.source,
        uTextureSampler: colorTexture.source.style,
        uIndexMap: indexTexture.source,
        uIndexMapSampler: indexTexture.source.style,
        uNormalMap: normalTexture.source,
        uNormalMapSampler: normalTexture.source.style,
        uPaletteLut: this.paletteTexture.source,
        uPaletteLutSampler: this.paletteTexture.source.style,
      },
    })
  }

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled
    this.uniforms.uParams[2] = enabled ? 1 : 0
    this.uniformGroup.update()
  }

  setTextures(colorTexture: Texture, normalTexture: Texture, indexTexture: Texture): void {
    this.shader.resources.uTexture = colorTexture.source
    this.shader.resources.uTextureSampler = colorTexture.source.style
    this.shader.resources.uNormalMap = normalTexture.source
    this.shader.resources.uNormalMapSampler = normalTexture.source.style
    this.shader.resources.uIndexMap = indexTexture.source
    this.shader.resources.uIndexMapSampler = indexTexture.source.style
  }

  update(update: SpriteMaterialUpdate): void {
    const uniforms = this.uniforms
    uniforms.uGlobal0[0] = update.paletteMode === 'indexed' ? 0 : 1
    uniforms.uGlobal0[1] = update.preferences.normalStrength
    uniforms.uGlobal0[2] = update.preferences.flipGreen ? 1 : 0
    uniforms.uGlobal0[3] = update.preferences.lightingEnabled ? 1 : 0
    uniforms.uParams[0] = update.preferences.specularEnabled ? update.preferences.specularStrength : 0
    uniforms.uParams[1] = 0
    uniforms.uParams[2] = this.debugMode ? 1 : 0
    uniforms.uParams[3] = 0
    uniforms.uDisplayTransform.set(update.displayTransform)
    uniforms.uObjectRect.set(update.objectRect)
    uniforms.uResolution.set(update.resolution)

    const lut = buildPaletteLut(update.palette, update.paletteSources)
    const canvas = this.paletteTexture.source.resource as HTMLCanvasElement
    const context = canvas.getContext('2d')
    if (context) {
      const imageData = context.createImageData(256, 1)
      imageData.data.set(lut)
      context.putImageData(imageData, 0, 0)
      this.paletteTexture.source.update()
    }

    update.palette.rules.slice(0, MAX_COLOR_RULES).forEach((rule, index) => {
      const sourceOffset = index * 4
      const targetOffset = index * 4
      const source = hexToRgb(rule.source)
      const target = hexToRgb(rule.target)
      uniforms.uRuleSources[sourceOffset] = source.r / 255
      uniforms.uRuleSources[sourceOffset + 1] = source.g / 255
      uniforms.uRuleSources[sourceOffset + 2] = source.b / 255
      uniforms.uRuleSources[sourceOffset + 3] = rule.tolerance
      uniforms.uRuleTargets[targetOffset] = target.r / 255
      uniforms.uRuleTargets[targetOffset + 1] = target.g / 255
      uniforms.uRuleTargets[targetOffset + 2] = target.b / 255
      uniforms.uRuleTargets[targetOffset + 3] = rule.enabled ? 1 : 0
    })
    for (let index = update.palette.rules.length; index < MAX_COLOR_RULES; index += 1) {
      const offset = index * 4
      uniforms.uRuleSources[offset + 3] = 0
      uniforms.uRuleTargets[offset + 3] = 0
    }

    const adjustments = update.palette.adjustments
    uniforms.uGlobal1[0] = adjustments.hue / 360
    uniforms.uGlobal1[1] = adjustments.saturation
    uniforms.uGlobal1[2] = adjustments.lightness
    uniforms.uGlobal1[3] = adjustments.contrast
    const tint = hexToRgb(adjustments.tint)
    uniforms.uGlobal2[0] = tint.r / 255
    uniforms.uGlobal2[1] = tint.g / 255
    uniforms.uGlobal2[2] = tint.b / 255
    uniforms.uGlobal2[3] = adjustments.tintStrength

    const ambient = hexToRgb(update.lighting.ambientColor)
    uniforms.uAmbient[0] = ambient.r / 255
    uniforms.uAmbient[1] = ambient.g / 255
    uniforms.uAmbient[2] = ambient.b / 255
    uniforms.uAmbient[3] = update.lighting.ambientIntensity
    const activeLights = update.lighting.lights.filter((light) => light.enabled).slice(0, MAX_LIGHTS)
    uniforms.uParams[1] = activeLights.length
    activeLights.forEach((light, index) => writeLight(uniforms, light, index))
    for (let index = activeLights.length; index < MAX_LIGHTS; index += 1) {
      writeLight(uniforms, undefined, index)
    }
    this.uniformGroup.update()
  }

  destroy(): void {
    this.paletteTexture.destroy(true)
    this.shader.destroy(true)
  }
}

function writeLight(uniforms: Record<string, Float32Array>, light: LightSource | undefined, index: number): void {
  const offset = index * 4
  if (!light) {
    uniforms.uLightPositions.fill(0, offset, offset + 4)
    uniforms.uLightColors.fill(0, offset, offset + 4)
    uniforms.uLightDirections.fill(0, offset, offset + 4)
    uniforms.uLightFalloff.fill(0, offset, offset + 4)
    return
  }
  const color = hexToRgb(light.color)
  const type = light.type === 'directional' ? 0 : light.type === 'point' ? 1 : 2
  const radians = (light.direction * Math.PI) / 180
  const inner = Math.cos((light.innerAngle * Math.PI) / 360)
  const outer = Math.cos((light.outerAngle * Math.PI) / 360)
  uniforms.uLightPositions[offset] = light.x
  uniforms.uLightPositions[offset + 1] = light.y
  uniforms.uLightPositions[offset + 2] = type
  uniforms.uLightPositions[offset + 3] = light.radius
  uniforms.uLightColors[offset] = color.r / 255
  uniforms.uLightColors[offset + 1] = color.g / 255
  uniforms.uLightColors[offset + 2] = color.b / 255
  uniforms.uLightColors[offset + 3] = light.intensity
  uniforms.uLightDirections[offset] = Math.cos(radians)
  uniforms.uLightDirections[offset + 1] = Math.sin(radians)
  uniforms.uLightDirections[offset + 2] = inner
  uniforms.uLightDirections[offset + 3] = outer
  uniforms.uLightFalloff[offset] = Math.max(0.1, light.falloff)
}