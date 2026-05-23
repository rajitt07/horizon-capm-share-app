import { useEffect, useRef } from 'react'

const DEFAULT_EASING = 'cubic-bezier(0.22, 0.61, 0.36, 1)'

export type RechartsStrokeDrawOptions = {
  /** Total draw transition length in ms */
  duration?: number
  /** `transition` timing-function */
  easing?: string
  /** Delay before line `i` starts drawing (ms) */
  delayForIndex?: (index: number) => number
  /** Re-run draw when this changes (e.g. chart data revision) */
  revision?: string | number
}

/**
 * After mount / data change, animates each `.recharts-line .recharts-line-curve`
 * path with SVG stroke-dashoffset (path length → 0). Attach `ref` to a wrapper
 * around `<ResponsiveContainer>`.
 */
export function useRechartsStrokeDraw(options: RechartsStrokeDrawOptions = {}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const optsRef = useRef(options)
  optsRef.current = options

  const revision = options.revision ?? 0
  const duration = options.duration ?? 1500
  const easing = options.easing ?? DEFAULT_EASING

  useEffect(() => {
    const root = ref.current
    if (!root) return

    let cancelled = false
    const { delayForIndex = (i: number) => i * 60 } = optsRef.current

    const run = (attempt = 0) => {
      if (cancelled) return
      const paths = root.querySelectorAll<SVGPathElement>(
        '.recharts-line .recharts-line-curve',
      )
      if (!paths.length) return

      const firstLen = paths[0].getTotalLength()
      if ((!Number.isFinite(firstLen) || firstLen <= 0) && attempt < 12) {
        requestAnimationFrame(() => run(attempt + 1))
        return
      }

      paths.forEach((path, index) => {
        const len = path.getTotalLength()
        if (!Number.isFinite(len) || len <= 0) return

        const savedAttrDash = path.getAttribute('stroke-dasharray')

        path.style.transition = 'none'
        path.style.strokeDasharray = `${len}`
        path.style.strokeDashoffset = `${len}`

        void path.getBoundingClientRect()

        const delay = delayForIndex(index)
        path.style.transition = `stroke-dashoffset ${duration}ms ${easing} ${delay}ms`

        const onEnd = (ev: TransitionEvent) => {
          if (ev.propertyName !== 'stroke-dashoffset') return
          path.style.transition = ''
          path.style.strokeDasharray = ''
          path.style.strokeDashoffset = ''
          if (savedAttrDash != null && savedAttrDash !== `${len}`) {
            path.setAttribute('stroke-dasharray', savedAttrDash)
          }
          path.removeEventListener('transitionend', onEnd)
        }

        path.addEventListener('transitionend', onEnd)

        requestAnimationFrame(() => {
          if (cancelled) return
          path.style.strokeDashoffset = '0'
        })
      })
    }

    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => run())
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(id)
      root.querySelectorAll<SVGPathElement>('.recharts-line .recharts-line-curve').forEach((path) => {
        path.style.transition = ''
        path.style.strokeDasharray = ''
        path.style.strokeDashoffset = ''
      })
    }
  }, [revision, duration, easing])

  return ref
}
