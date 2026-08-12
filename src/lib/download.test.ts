import { describe, it, expect } from 'vitest'
import { safeFileName } from './download'

describe('safeFileName', () => {
  it('保留中文與英數字', () => {
    expect(safeFileName('春季展場 A區', 'png')).toBe('春季展場 A區.png')
  })

  it('把路徑與檔名不合法的字元換成底線', () => {
    expect(safeFileName('a/b\\c:d*e?f"g<h>i|j', 'png')).toBe('a_b_c_d_e_f_g_h_i_j.png')
  })

  it('去掉頭尾空白', () => {
    expect(safeFileName('  展場  ', 'json')).toBe('展場.json')
  })

  it('空名稱回退到預設名', () => {
    expect(safeFileName('', 'png')).toBe('未命名專案.png')
    expect(safeFileName('   ', 'png')).toBe('未命名專案.png')
  })

  it('名稱過長時截斷', () => {
    const long = 'あ'.repeat(200)
    const result = safeFileName(long, 'png')
    expect(result.length).toBeLessThanOrEqual(84)
    expect(result.endsWith('.png')).toBe(true)
  })
})
