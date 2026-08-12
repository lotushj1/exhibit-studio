import { Flex, Text, TextField } from '@radix-ui/themes'
import { useSceneStore } from '../store/sceneStore'
import { cmToM, mToCm } from '../lib/units'
import { useBufferedNumberInput } from './useBufferedNumberInput'

/**
 * 位置與旋轉的數值輸入。位置以公分顯示，旋轉以度顯示。
 *
 * 數字輸入框的「本地草稿 + 失焦/Enter 提交、Escape 取消」邏輯跟
 * `ParamField` 共用同一個 `useBufferedNumberInput`（見該檔案註解），
 * 避免兩邊各自演化到不一致。
 */
export function TransformFields({ objectId }: { objectId: string }) {
  const object = useSceneStore((s) => s.objects.find((o) => o.id === objectId))
  const setTransform = useSceneStore((s) => s.setTransform)
  if (!object) return null

  const [x, , z] = object.transform.position
  const deg = (object.transform.rotationY * 180) / Math.PI

  const setPos = (axis: 0 | 2, cm: number) => {
    const next: [number, number, number] = [...object.transform.position] as [number, number, number]
    next[axis] = cmToM(cm)
    setTransform(objectId, { position: next })
  }

  return (
    <Flex direction="column" gap="2">
      <Text size="1" color="gray" weight="medium">位置與角度</Text>
      <Flex gap="2">
        <Field label="X" value={Math.round(mToCm(x))} onCommit={(v) => setPos(0, v)} suffix="cm" />
        <Field label="Z" value={Math.round(mToCm(z))} onCommit={(v) => setPos(2, v)} suffix="cm" />
        <Field
          label="角度"
          value={Math.round(deg)}
          onCommit={(v) => setTransform(objectId, { rotationY: (v * Math.PI) / 180 })}
          suffix="°"
        />
      </Flex>
    </Flex>
  )
}

function Field({
  label, value, onCommit, suffix,
}: { label: string; value: number; onCommit: (v: number) => void; suffix: string }) {
  const { displayValue, inputProps } = useBufferedNumberInput(value, onCommit)

  return (
    <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 0 }}>
      <Text size="1" color="gray">{label}</Text>
      <TextField.Root size="1" type="number" value={displayValue} {...inputProps}>
        <TextField.Slot side="right"><Text size="1" color="gray">{suffix}</Text></TextField.Slot>
      </TextField.Root>
    </Flex>
  )
}
