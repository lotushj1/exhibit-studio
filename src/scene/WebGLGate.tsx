import { useMemo, type ReactNode } from 'react'
import { Flex, Text } from '@radix-ui/themes'

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/** 不支援 WebGL 時顯示說明，而不是留一片黑畫面。 */
export function WebGLGate({ children }: { children: ReactNode }) {
  const supported = useMemo(hasWebGL, [])
  if (supported) return <>{children}</>

  return (
    <Flex align="center" justify="center" direction="column" gap="2" style={{ height: '100%' }} p="4">
      <Text size="3" weight="medium">這個瀏覽器不支援 WebGL</Text>
      <Text size="2" color="gray" align="center">
        請改用較新版本的 Chrome、Edge、Firefox 或 Safari，並確認顯示卡加速沒有被關閉
      </Text>
    </Flex>
  )
}
