import { Decimal } from 'decimal.js'
import { fromDecimalToNano, fromNanoToDecimal } from '../utils'
import { tonApiClient, tonApiOldClient } from './api'
import { Address, Sender } from '@ton/core'
import { BclSDK, simpleTonapiProvider } from 'ton-bcl-sdk'
import { configService } from './config'

const defaultSlippage = 20

const sdk = BclSDK.create({
  apiProvider: simpleTonapiProvider(tonApiOldClient),
  clientOptions: {
    endpoint: '',
  },
  masterAddress: Address.parseFriendly(configService.tonFunMasterAddress!).address,
})

const getMinReceive = (amount: Decimal, slippage: number) => {
  return amount.times(100 - slippage).div(100)
}

const getBuyInfo = async ({ tons, jettonAddress, slippage }: { tons: Decimal, jettonAddress: string; slippage: number }) => {
  const res = await sdk.openCoin(Address.parse(jettonAddress)).getCoinsForTons(fromDecimalToNano(tons))

  const maxReceive = fromNanoToDecimal(res.coins)
  const minReceive = getMinReceive(maxReceive, slippage)

  return {
    minReceive,
    maxReceive,
    platformFee: fromNanoToDecimal(res.fees),
  }
}

const getSellInfo = async ({ jettons, jettonAddress, slippage }: { jettons: Decimal, jettonAddress: string; slippage: number }) => {
  const res = await sdk.openCoin(Address.parse(jettonAddress)).getTonsForCoins(fromDecimalToNano(jettons))

  const maxReceive = fromNanoToDecimal(res.tons)
  const minReceive = getMinReceive(maxReceive, slippage)

  return {
    minReceive,
    maxReceive,
    platformFee: fromNanoToDecimal(res.fees),
  }
}

export const tonfunService = {
  async getBuy({ tonAmount, jettonAddress, slippage = defaultSlippage }: { jettonAddress: string; tonAmount: Decimal; slippage?: number; userWalletAddress: string }) {
    const buyInfo = await getBuyInfo({ tons: tonAmount, jettonAddress, slippage })

    const opts = {
      tons: fromDecimalToNano(tonAmount),
      minReceive: fromDecimalToNano(buyInfo.minReceive),
      referral: null
    }

    return (sender: Sender) => sdk.openCoin(Address.parse(jettonAddress)).sendBuy(sender, opts)
  },

  async getSell({ jettonAmount, jettonAddress, userWalletAddress, slippage = defaultSlippage }: { jettonAddress: string; jettonAmount: Decimal; slippage?: number; userWalletAddress: string }) {
    const sellInfo = await getSellInfo({ jettons: jettonAmount, jettonAddress, slippage })

    const opts = {
      amount: fromDecimalToNano(jettonAmount),
      minReceive: fromDecimalToNano(sellInfo.minReceive),
      referral: null,
      queryId: BigInt(0)
    }

    const userWallet= await sdk.openCoin(Address.parse(jettonAddress)).getUserWallet(Address.parse(userWalletAddress))

    return (sender: Sender) => userWallet.sendSellCoins(sender, opts)
  },

  getTransactionStatus: async (hash: string, jettonAddress: string) => {
    const res = await tonApiClient.events.getEvent(hash)
    
    if (res.inProgress) throw new Error('Transaction in progress')

    const masterCall = res.actions.find(
      (a) => a.type === 'SmartContractExec' && a.SmartContractExec?.contract.address.equals(Address.parseFriendly(jettonAddress).address),
    )

    if (!masterCall || masterCall.status !== 'ok' || res.actions.find((act) => act.status !== 'ok')) return false

    return true
  }
}
