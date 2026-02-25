'use client';

import { ConnectButton as RainbowConnectButton } from '@rainbow-me/rainbowkit';
import { cn } from '@/lib/utils';

interface ConnectButtonProps {
  className?: string;
}

export function ConnectButton({ className }: ConnectButtonProps) {
  return (
    <RainbowConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== 'loading';
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === 'authenticated');

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    type="button"
                    className={cn(
                      'px-6 py-3 rounded-lg font-medium text-white',
                      'bg-gradient-to-r from-primary-500 to-primary-600',
                      'hover:from-primary-400 hover:to-primary-500',
                      'transition-all duration-200 shadow-lg shadow-primary-500/25',
                      'hover:shadow-xl hover:shadow-primary-500/30',
                      'active:scale-[0.98]',
                      className
                    )}
                  >
                    Connect Wallet
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    type="button"
                    className="px-6 py-3 rounded-lg font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
                  >
                    Wrong network
                  </button>
                );
              }

              return (
                <div className="flex items-center gap-3">
                  <button
                    onClick={openChainModal}
                    type="button"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-700 text-gray-300 hover:text-white transition-colors"
                  >
                    {chain.hasIcon && (
                      <div
                        style={{
                          background: chain.iconBackground,
                          width: 12,
                          height: 12,
                          borderRadius: 999,
                        }}
                      >
                        {chain.iconUrl && (
                          <img
                            alt={chain.name ?? 'Chain icon'}
                            src={chain.iconUrl}
                            style={{ width: 12, height: 12 }}
                          />
                        )}
                      </div>
                    )}
                    {chain.name}
                  </button>

                  <button
                    onClick={openAccountModal}
                    type="button"
                    className="px-4 py-2 rounded-lg bg-dark-700 text-gray-300 hover:text-white transition-colors font-mono"
                  >
                    {account.displayName}
                    {account.displayBalance && (
                      <span className="ml-2 text-gray-500">
                        ({account.displayBalance})
                      </span>
                    )}
                  </button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </RainbowConnectButton.Custom>
  );
}

export default ConnectButton;
