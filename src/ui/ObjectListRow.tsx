import { useEffect, useRef, useState } from 'react'
import { Flex, IconButton, Text, TextField } from '@radix-ui/themes'
import { EyeOpenIcon, EyeClosedIcon, LockClosedIcon, LockOpen1Icon, TrashIcon } from '@radix-ui/react-icons'
import { useSceneStore } from '../store/sceneStore'
import type { SceneObject } from '../objects/types'

/**
 * 單一場景物件列。改名欄位刻意用本地 state 緩衝：
 *
 * `sceneStore.renameObject` 每次呼叫都會經過 `commit`，把整包 `objects`
 * 深拷貝推進復原歷史、清空 `future`。如果 `onChange` 直接呼叫它，使用者
 * 打一個字就吃一筆歷史——改名成「主視覺背板」要按五次 Cmd+Z 才退得回去，
 * 而且 `HISTORY_LIMIT`（50）很容易被打字本身吃滿，把使用者真正在意的
 * 操作（搬移、刪除、調尺寸）擠出歷史。
 *
 * 所以這裡只在**失焦或按 Enter 提交**時才寫進 store；打字過程只改本地
 * `draft`，不碰 store、不佔歷史。
 *
 * 非編輯狀態的名稱是一個可聚焦、可用鍵盤操作的控制項（`tabIndex` +
 * `role="button"` + `Enter`/`F2` 進入編輯），不是純裝飾文字：純鍵盤或
 * 輔助科技的使用者要能不靠滑鼠雙擊就改到名字。
 */
export function ObjectListRow({ object, selected }: { object: SceneObject; selected: boolean }) {
  const selectObject = useSceneStore((s) => s.selectObject)
  const removeObject = useSceneStore((s) => s.removeObject)
  const renameObject = useSceneStore((s) => s.renameObject)
  const toggleVisible = useSceneStore((s) => s.toggleVisible)
  const toggleLocked = useSceneStore((s) => s.toggleLocked)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(object.name)
  /** Escape 放棄編輯時設為 true，讓隨之而來的 blur 事件不要重新提交。 */
  const cancelledRef = useRef(false)
  /** 名稱標籤本身的 DOM 節點，用來在鍵盤流程結束編輯後把焦點還給它。 */
  const labelRef = useRef<HTMLSpanElement>(null)
  /**
   * 只有「鍵盤觸發的 Enter 提交 / Escape 放棄」才需要把焦點還給名稱標籤。
   * 使用者點別的地方失焦（滑鼠）時不應該被搶走焦點，所以用旗標區分，
   * 只在 Enter/Escape 的 keydown handler 裡設為 true。
   */
  const refocusLabelRef = useRef(false)

  /**
   * 同步外部變更（例如使用者按 Cmd+Z 復原改名，store 裡的名稱會變）。
   * 只在「目前沒有在編輯」時才跟著 store 走，避免使用者打字打到一半
   * 被外部狀態蓋掉。
   */
  useEffect(() => {
    if (!editing) setDraft(object.name)
  }, [object.name, editing])

  /** 編輯結束後，如果是鍵盤流程觸發的，把焦點還給名稱標籤。 */
  useEffect(() => {
    if (!editing && refocusLabelRef.current) {
      refocusLabelRef.current = false
      labelRef.current?.focus()
    }
  }, [editing])

  function commit(cancelled: boolean) {
    if (!cancelled) {
      const trimmed = draft.trim()
      // 空白（或只有空格）不提交，退回原本的名稱，不讓物件被清空名字。
      if (trimmed && trimmed !== object.name) {
        renameObject(object.id, trimmed)
      }
    }
    setDraft(object.name)
    setEditing(false)
  }

  return (
    <Flex
      align="center"
      gap="1"
      px="2"
      py="1"
      onClick={() => selectObject(object.id)}
      style={{
        borderRadius: 'var(--radius-2)',
        cursor: 'pointer',
        background: selected ? 'var(--gray-4)' : 'transparent',
      }}
    >
      {editing ? (
        <TextField.Root
          size="1"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={() => {
            commit(cancelledRef.current)
            cancelledRef.current = false
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              refocusLabelRef.current = true
              e.currentTarget.blur()
            } else if (e.key === 'Escape') {
              cancelledRef.current = true
              refocusLabelRef.current = true
              e.currentTarget.blur()
            }
          }}
          style={{ flex: 1, minWidth: 0 }}
        />
      ) : (
        <Text
          ref={labelRef}
          size="1"
          tabIndex={0}
          role="button"
          aria-label={`重新命名 ${object.name}`}
          className="object-list-row__name"
          onDoubleClick={(e) => {
            e.stopPropagation()
            setEditing(true)
          }}
          onKeyDown={(e) => {
            // ARIA 的 role="button" 慣例期待 Enter 與 Space 都能觸發，不只 Enter。
            if (e.key === 'Enter' || e.key === 'F2' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              setEditing(true)
            }
          }}
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            padding: '0 var(--space-2)',
            borderRadius: 'var(--radius-1)',
          }}
        >
          {object.name}
        </Text>
      )}
      <IconButton size="1" variant="ghost" color="gray" onClick={(e) => { e.stopPropagation(); toggleVisible(object.id) }}>
        {object.visible ? <EyeOpenIcon /> : <EyeClosedIcon />}
      </IconButton>
      <IconButton size="1" variant="ghost" color="gray" onClick={(e) => { e.stopPropagation(); toggleLocked(object.id) }}>
        {object.locked ? <LockClosedIcon /> : <LockOpen1Icon />}
      </IconButton>
      <IconButton size="1" variant="ghost" color="gray" onClick={(e) => { e.stopPropagation(); removeObject(object.id) }}>
        <TrashIcon />
      </IconButton>
    </Flex>
  )
}
