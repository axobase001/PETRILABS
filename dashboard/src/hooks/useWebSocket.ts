import { useEffect, useRef, useCallback } from 'react'
import useStore from '@/store'
import type { WebSocketMessage } from '@/types'

const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.host}/ws`

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null)
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttempts = useRef(0)
  const MAX_RECONNECT_ATTEMPTS = 5
  const RECONNECT_DELAY = 3000

  const { setWsConnected, addWsMessage, selectedAgent } = useStore()

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return

    try {
      ws.current = new WebSocket(WS_URL)

      ws.current.onopen = () => {
        console.log('WebSocket connected')
        setWsConnected(true)
        reconnectAttempts.current = 0

        // Subscribe to selected agent if any
        if (selectedAgent) {
          ws.current?.send(
            JSON.stringify({
              action: 'subscribe',
              agentAddress: selectedAgent,
            })
          )
        }
      }

      ws.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          addWsMessage(message)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      ws.current.onclose = () => {
        console.log('WebSocket disconnected')
        setWsConnected(false)
        attemptReconnect()
      }

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error)
      }
    } catch (error) {
      console.error('Failed to connect WebSocket:', error)
    }
  }, [setWsConnected, addWsMessage, selectedAgent])

  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current)
      reconnectTimeout.current = null
    }
    ws.current?.close()
    ws.current = null
  }, [])

  const attemptReconnect = useCallback(() => {
    if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
      console.error('Max reconnection attempts reached')
      return
    }

    reconnectAttempts.current++
    console.log(
      `Attempting to reconnect... (${reconnectAttempts.current}/${MAX_RECONNECT_ATTEMPTS})`
    )

    reconnectTimeout.current = setTimeout(() => {
      connect()
    }, RECONNECT_DELAY)
  }, [connect])

  const sendMessage = useCallback((message: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message))
    } else {
      console.warn('WebSocket is not connected')
    }
  }, [])

  const subscribe = useCallback(
    (agentAddress: string) => {
      sendMessage({ action: 'subscribe', agentAddress })
    },
    [sendMessage]
  )

  const unsubscribe = useCallback(
    (agentAddress: string) => {
      sendMessage({ action: 'unsubscribe', agentAddress })
    },
    [sendMessage]
  )

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  // Resubscribe when selected agent changes
  useEffect(() => {
    if (ws.current?.readyState === WebSocket.OPEN && selectedAgent) {
      subscribe(selectedAgent)
    }
  }, [selectedAgent, subscribe])

  return { sendMessage, subscribe, unsubscribe }
}

export default useWebSocket
