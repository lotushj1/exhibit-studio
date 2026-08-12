import { cmToM } from '../../lib/units'
import { SurfaceMaterial } from '../../materials/SurfaceMaterial'
import { computeProportions, BUILD_PRESETS, type BuildPreset } from './proportions'
import { num, str } from '../types'
import type { ObjectDef, ObjectRenderProps, ParamValue, SurfaceSpec } from '../types'

const FALLBACK: SurfaceSpec = { finish: 'matte', color: '#b9bec4' }

/**
 * Three.js 的 `capsuleGeometry(radius, length, ...)` 實際包圍高度是
 * `length + 2 * radius`（圓柱中段之外，兩端各多出一個半球體帽），不是
 * `length` 本身。這個函式反過來算：要讓部位的實際總高精確等於 `totalCm`，
 * `length` 該給多少。
 *
 * 若半徑超過總高一半（極端參數下理論上可能發生，目前 schema 範圍內不會
 * 觸發），`length` 會被夾到一個很小的正值，避免傳負數給 Three.js 造成
 * 幾何體錯誤，而不是讓總高悄悄失真。
 */
export function capsuleLengthCm(totalCm: number, radiusCm: number): number {
  return Math.max(0.01, totalCm - radiusCm * 2)
}

export type FigureLayout = {
  headRadiusCm: number
  headLengthCm: number
  headCenterYCm: number
  neckRadiusCm: number
  neckHeightCm: number
  neckCenterYCm: number
  torsoTopRadiusCm: number
  torsoBottomRadiusCm: number
  torsoHeightCm: number
  torsoCenterYCm: number
  legRadiusCm: number
  legLengthCm: number
  legCenterYCm: number
  legOffsetXCm: number
  armRadiusCm: number
  armLengthCm: number
  armCenterYCm: number
  armOffsetXCm: number
}

/**
 * 把 `computeProportions` 算出的各部位公分尺寸，轉成實際要餵給 Three.js
 * 幾何體建構子的參數（capsule 的 length、各部位的水平位置），全部維持
 * 公分單位——Render 端才轉公尺，測試端可以直接驗算不變量（總高、腳底
 * 位置、部位是否重疊）而不必碰 Three.js。
 */
export function computeFigureLayout(
  heightCm: number,
  preset: BuildPreset,
  girth: number,
): FigureLayout {
  const p = computeProportions(heightCm, preset, girth)

  const legRadiusCm = p.limbDiameterCm / 2
  const legLengthCm = capsuleLengthCm(p.legHeightCm, legRadiusCm)
  // 雙腿左右各退到臀寬的四分之一處；夾住讓兩腿內側邊緣至少留 0.1 公分
  // 間隙，避免「腿很粗＋臀很窄」的極端組合下兩腿互相穿模（目前 schema
  // 範圍內夾制不會觸發，但函式本身要能承受任意輸入）。
  const legOffsetXCm = Math.max(legRadiusCm + 0.1, p.hipWidthCm / 4)

  const armRadiusCm = legRadiusCm * 0.75
  const armLengthCm = capsuleLengthCm(p.armLengthCm, armRadiusCm)
  // 手臂掛在肩寬外側，往外加一點手臂半徑的餘裕：偏移量比「肩寬一半＋
  // 手臂半徑」略小一些，讓手臂內緣在肩膀（軀幹最寬處）貼齊甚至微微
  // 插入，看起來像真的接在肩膀上，而不是在旁邊留一道縫；往下到臀部
  // 因為軀幹本身內收，手臂自然會與軀幹拉開一點距離，這跟真人站姿手臂
  // 與腰身之間本來就有空隙一致，不是穿模也不是飄浮。
  const armOffsetXCm = p.shoulderWidthCm / 2 + legRadiusCm * 0.6

  const headRadiusCm = p.headWidthCm / 2
  const headLengthCm = capsuleLengthCm(p.headHeightCm, headRadiusCm)

  return {
    headRadiusCm,
    headLengthCm,
    headCenterYCm: p.headCenterYCm,
    neckRadiusCm: legRadiusCm * 0.8,
    neckHeightCm: p.neckHeightCm,
    neckCenterYCm: p.legHeightCm + p.torsoHeightCm + p.neckHeightCm / 2,
    torsoTopRadiusCm: p.shoulderWidthCm / 2,
    torsoBottomRadiusCm: p.hipWidthCm / 2,
    torsoHeightCm: p.torsoHeightCm,
    torsoCenterYCm: p.torsoCenterYCm,
    legRadiusCm,
    legLengthCm,
    legCenterYCm: p.legCenterYCm,
    legOffsetXCm,
    armRadiusCm,
    armLengthCm,
    armCenterYCm: p.armCenterYCm,
    armOffsetXCm,
  }
}

function Render({ params, surfaces }: ObjectRenderProps) {
  const preset = (str(params, 'build') || 'male') as BuildPreset
  const l = computeFigureLayout(num(params, 'heightCm'), preset, num(params, 'girth'))
  const skin = surfaces.body ?? FALLBACK

  return (
    <group>
      {/* 頭 */}
      <mesh position={[0, cmToM(l.headCenterYCm), 0]} castShadow>
        <capsuleGeometry args={[cmToM(l.headRadiusCm), cmToM(l.headLengthCm), 4, 12]} />
        <SurfaceMaterial
          spec={skin}
          widthCm={l.headRadiusCm * 2}
          heightCm={l.headLengthCm + l.headRadiusCm * 2}
        />
      </mesh>

      {/* 頸 */}
      <mesh position={[0, cmToM(l.neckCenterYCm), 0]} castShadow>
        <cylinderGeometry args={[cmToM(l.neckRadiusCm), cmToM(l.neckRadiusCm), cmToM(l.neckHeightCm), 10]} />
        <SurfaceMaterial spec={skin} widthCm={l.neckRadiusCm * 2} heightCm={l.neckHeightCm} />
      </mesh>

      {/* 軀幹：上寬下窄的梯形柱 */}
      <mesh position={[0, cmToM(l.torsoCenterYCm), 0]} castShadow receiveShadow>
        <cylinderGeometry
          args={[cmToM(l.torsoTopRadiusCm), cmToM(l.torsoBottomRadiusCm), cmToM(l.torsoHeightCm), 12]}
        />
        <SurfaceMaterial spec={skin} widthCm={l.torsoTopRadiusCm * 2} heightCm={l.torsoHeightCm} />
      </mesh>

      {/* 雙腿 */}
      {[-1, 1].map((sign) => (
        <mesh
          key={`leg-${sign}`}
          position={[sign * cmToM(l.legOffsetXCm), cmToM(l.legCenterYCm), 0]}
          castShadow
        >
          <capsuleGeometry args={[cmToM(l.legRadiusCm), cmToM(l.legLengthCm), 4, 10]} />
          <SurfaceMaterial
            spec={skin}
            widthCm={l.legRadiusCm * 2}
            heightCm={l.legLengthCm + l.legRadiusCm * 2}
          />
        </mesh>
      ))}

      {/* 雙臂 */}
      {[-1, 1].map((sign) => (
        <mesh
          key={`arm-${sign}`}
          position={[sign * cmToM(l.armOffsetXCm), cmToM(l.armCenterYCm), 0]}
          castShadow
        >
          <capsuleGeometry args={[cmToM(l.armRadiusCm), cmToM(l.armLengthCm), 4, 10]} />
          <SurfaceMaterial
            spec={skin}
            widthCm={l.armRadiusCm * 2}
            heightCm={l.armLengthCm + l.armRadiusCm * 2}
          />
        </mesh>
      ))}
    </group>
  )
}

export const humanFigureDef: ObjectDef = {
  kind: 'humanFigure',
  label: '假人',
  category: 'figure',
  schema: [
    {
      key: 'build',
      label: '體型',
      type: 'select',
      default: 'male',
      options: [
        { value: 'male', label: BUILD_PRESETS.male.label },
        { value: 'female', label: BUILD_PRESETS.female.label },
        { value: 'child', label: BUILD_PRESETS.child.label },
      ],
      sideEffect: (value): Record<string, ParamValue> => {
        const preset = BUILD_PRESETS[value as BuildPreset]
        return preset ? { heightCm: preset.defaultHeightCm } : {}
      },
    },
    { key: 'heightCm', label: '身高', type: 'number', min: 80, max: 200, step: 1, unit: 'cm', default: 173 },
    { key: 'girth', label: '胖瘦', type: 'number', min: 0.7, max: 1.6, step: 0.05, unit: '', default: 1 },
  ],
  surfaces: [{ id: 'body', label: '人偶', defaultFinish: 'matte' }],
  Render,
  defaultTransform: { position: [1, 0, 1], rotationY: 0 },
}
