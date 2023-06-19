// pnpm test -- gyroEV2Pool.spec.ts

import { ChainId, RawGyroEPool, SwapKind, Token, TokenAmount } from '../src';
import { GyroEPool } from '../src/entities/pools/gyroE';
import testPools from './lib/testData/gyroETestPool.json';
import { expectToBeCloseToDelta } from './lib/utils/helpers';

describe('gyroEPool tests', () => {
    const testPool = { ...testPools }.pools[1] as RawGyroEPool;
    const chainId = ChainId.GOERLI;
    const pool = GyroEPool.fromRawPool(chainId, testPool);
    const tokenIn = new Token(
        chainId,
        '0x2a7fa61d84db003a999bf4623942f235bff659a8',
        18,
        'MTK',
    );
    const tokenOut = new Token(
        chainId,
        '0x4ac0909d762f20dfee3efc6a5ce1029c78812648',
        18,
        'MTK2',
    );
    describe.skip('normalized liquidity', () => {
        test('should correctly calculate normalized liquidity', async () => {
            const normalizedLiquidity = pool.getNormalizedLiquidity(
                tokenIn,
                tokenOut,
            );

            expectToBeCloseToDelta(
                normalizedLiquidity,
                8521784473067058000000000n,
                10000000000000,
            );
        });
    });

    describe('limit amount swap', () => {
        test('should correctly calculate limit amount for swap exact in', async () => {
            const limitAmount = pool.getLimitAmountSwap(
                tokenIn,
                tokenOut,
                SwapKind.GivenIn,
            );

            expectToBeCloseToDelta(
                limitAmount,
                236323201823051507893n,
                10000000000000,
            );
        });

        test('should correctly calculate limit amount for swap exact out', async () => {
            const limitAmount = pool.getLimitAmountSwap(
                tokenIn,
                tokenOut,
                SwapKind.GivenOut,
            );

            expectToBeCloseToDelta(
                limitAmount,
                99999900000000000000n,
                10000000000000,
            );
        });
    });

    describe('swap amounts', () => {
        test('should correctly calculate swap amount for swap exact in', async () => {
            const swapAmount = pool.swapGivenIn(
                tokenIn,
                tokenOut,
                TokenAmount.fromHumanAmount(tokenIn, '10'),
            );

            expectToBeCloseToDelta(
                swapAmount.amount,
                4231511373250766852n,
                10000000000000,
            );
        });

        test('should correctly calculate swap amount for swap exact out', async () => {
            const swapAmount = pool.swapGivenOut(
                tokenIn,
                tokenOut,
                TokenAmount.fromHumanAmount(tokenOut, '10'),
            );

            const amountInLessFee =
                pool.subtractSwapFeeAmount(swapAmount).amount;
            expectToBeCloseToDelta(
                amountInLessFee,
                21505324893272912024n,
                100000000000000,
            );
        });
    });
});
