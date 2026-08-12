import { Flex, Select, Slider, Switch, Text, TextField } from '@radix-ui/themes'
import { useSceneStore } from '../store/sceneStore'
import { useBufferedNumberInput } from './useBufferedNumberInput'
import type { ParamDef, ParamValue } from '../objects/types'

type Props = {
  objectId: string
  param: ParamDef
  value: ParamValue
}

/**
 * 依 ParamDef 產生對應的輸入元件。新增物件不需修改這個檔案。
 *
 * number 類型的滑桿與數字輸入框刻意分成「即時但不進歷史」與
 * 「離開時才進歷史」兩條路徑——教訓來自 Task 14 的改名輸入框：
 * 如果每個互動片段都呼叫會 commit 的 store 動作，使用者拖一次滑桿
 * 就會推幾十筆復原歷史，`HISTORY_LIMIT`（50）馬上被打字/拖曳本身
 * 吃滿，把使用者真正在意的操作擠出去。
 *
 * - 滑桿：拖曳中用 `onValueChange` 呼叫 `setParamLive`，讓 3D 畫面
 *   即時跟著動但不進歷史；放開時用 `onValueCommit` 呼叫 `setParam`，
 *   一次性把整段拖曳前的值 commit 成一筆歷史（見 sceneStore 的
 *   `liveSnapshot` 機制）。
 * - 數字輸入框：比照 `ObjectListRow` 的改名欄位，打字只改本地
 *   `draft`，失焦或按 Enter 才呼叫 `setParam` 提交，過程中畫面
 *   不會跟著每個字元跳動。
 */
export function ParamField({ objectId, param, value }: Props) {
  const setParam = useSceneStore((s) => s.setParam)

  if (param.type === 'boolean') {
    return (
      <Flex align="center" justify="between" gap="2">
        <Text size="1">{param.label}</Text>
        <Switch size="1" checked={value === true} onCheckedChange={(v) => setParam(objectId, param.key, v)} />
      </Flex>
    )
  }

  if (param.type === 'select') {
    return (
      <Flex direction="column" gap="1">
        <Text size="1" color="gray">{param.label}</Text>
        <Select.Root size="1" value={String(value)} onValueChange={(v) => setParam(objectId, param.key, v)}>
          <Select.Trigger />
          <Select.Content>
            {param.options?.map((o) => (
              <Select.Item key={o.value} value={o.value}>{o.label}</Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Flex>
    )
  }

  return <NumberParamField objectId={objectId} param={param} value={value} />
}

/** number 類型參數：數字輸入框（失焦/Enter 才提交、Escape 取消）＋滑桿（拖曳即時、放開才提交）。 */
function NumberParamField({ objectId, param, value }: Props) {
  const setParam = useSceneStore((s) => s.setParam)
  const setParamLive = useSceneStore((s) => s.setParamLive)

  const storeValue = typeof value === 'number' ? value : 0
  const unit = param.unit === 'cm' ? ' cm' : param.unit === 'deg' ? '°' : ''

  const { displayValue, inputProps } = useBufferedNumberInput(storeValue, (next) =>
    setParam(objectId, param.key, next),
  )

  return (
    <Flex direction="column" gap="1">
      <Flex align="center" justify="between">
        <Text size="1" color="gray">{param.label}</Text>
        <TextField.Root
          size="1"
          type="number"
          value={displayValue}
          min={param.min}
          max={param.max}
          step={param.step}
          {...inputProps}
          style={{ width: 84 }}
        >
          <TextField.Slot side="right">
            <Text size="1" color="gray">{unit.trim()}</Text>
          </TextField.Slot>
        </TextField.Root>
      </Flex>
      <Slider
        size="1"
        value={[storeValue]}
        min={param.min ?? 0}
        max={param.max ?? 100}
        step={param.step ?? 1}
        onValueChange={([v]) => setParamLive(objectId, param.key, v)}
        onValueCommit={([v]) => setParam(objectId, param.key, v)}
      />
    </Flex>
  )
}
