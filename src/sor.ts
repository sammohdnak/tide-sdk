import { Router } from './router';
import { BasePool, Path, Token, TokenAmount, SwapV2 } from './entities';
import { ChainId, checkInputs, SUBGRAPH_URLS, BATCHSIZE, VAULT } from './utils';
import { SorConfig, SwapInputRawAmount, SwapKind, SwapOptions } from './types';
import { PoolParser } from './entities/pools/parser';
import { OnChainPoolDataEnricherV2, SubgraphPoolProviderV2 } from './data';
import { PoolDataService } from './data/poolDataService';
import { GetPoolsResponse } from './data/types';
import { SubgraphPoolProviderV3 } from './data/providers/subgraphPoolProviderV3';
import { OnChainPoolDataEnricherV3 } from './data/enrichers/onChainPoolDataEnricherV3';
import { SwapV3 } from './entities/swapV3';

export class SmartOrderRouter {
    private readonly chainId: ChainId;
    private readonly router: Router;
    private readonly poolParser: PoolParser;
    private readonly poolDataService: PoolDataService;
    private pools: BasePool[] = [];
    private blockNumber: bigint | null = null;
    private poolsProviderData: GetPoolsResponse | null = null;
    private balancerVersion: 2 | 3;

    constructor({
        chainId,
        rpcUrl,
        poolDataProviders,
        poolDataEnrichers,
        customPoolFactories = [],
        balancerVersion = 2,
    }: SorConfig) {
        this.chainId = chainId;
        this.router = new Router();
        this.poolParser = new PoolParser(chainId, customPoolFactories);
        this.balancerVersion = balancerVersion;
        poolDataProviders =
            poolDataProviders ||
            (balancerVersion === 2
                ? new SubgraphPoolProviderV2(chainId, SUBGRAPH_URLS[chainId])
                : new SubgraphPoolProviderV3(chainId, SUBGRAPH_URLS[chainId]));
        poolDataEnrichers =
            poolDataEnrichers ||
            (balancerVersion === 2
                ? new OnChainPoolDataEnricherV2(
                      chainId,
                      rpcUrl,
                      BATCHSIZE[chainId],
                      VAULT[chainId],
                  )
                : new OnChainPoolDataEnricherV3(
                      chainId,
                      rpcUrl,
                      BATCHSIZE[chainId],
                      VAULT[chainId],
                  ));
        this.poolDataService = new PoolDataService(
            Array.isArray(poolDataProviders)
                ? poolDataProviders
                : [poolDataProviders],
            Array.isArray(poolDataEnrichers)
                ? poolDataEnrichers
                : [poolDataEnrichers],
            rpcUrl,
        );
    }

    public async fetchAndCachePools(blockNumber?: bigint): Promise<BasePool[]> {
        const { rawPools, providerData } =
            await this.poolDataService.fetchEnrichedPools(blockNumber);
        this.pools = this.poolParser.parseRawPools(rawPools);
        this.blockNumber = typeof blockNumber === 'bigint' ? blockNumber : null;
        this.poolsProviderData = providerData;

        return this.pools;
    }

    public async fetchAndCacheLatestPoolEnrichmentData(blockNumber?: bigint) {
        if (!this.poolsProviderData) {
            throw new Error(
                'fetchAndCacheLatestPoolEnrichmentData can only be called after a successful call to fetchAndCachePools',
            );
        }

        const providerOptions = {
            block: blockNumber,
            timestamp: await this.poolDataService.getTimestampForBlockNumber(
                blockNumber,
            ),
        };

        const enriched = await this.poolDataService.enrichPools(
            this.poolsProviderData,
            providerOptions,
        );
        this.pools = this.poolParser.parseRawPools(enriched);
    }

    public get isInitialized(): boolean {
        return this.pools.length > 0;
    }

    public async getSwaps(
        tokenIn: Token,
        tokenOut: Token,
        swapKind: SwapKind,
        swapAmount: SwapInputRawAmount | TokenAmount,
        swapOptions?: SwapOptions,
    ): Promise<SwapV2 | SwapV3 | null> {
        const checkedSwapAmount = checkInputs(
            tokenIn,
            tokenOut,
            swapKind,
            swapAmount,
        );
        const candidatePaths = await this.getCandidatePaths(
            tokenIn,
            tokenOut,
            swapOptions,
        );

        const bestPaths = this.router.getBestPaths(
            candidatePaths,
            swapKind,
            checkedSwapAmount,
        );

        if (!bestPaths) return null;

        if (this.balancerVersion === 2)
            return new SwapV2({ paths: bestPaths, swapKind });
        else return new SwapV3({ paths: bestPaths, swapKind });
    }

    public async getCandidatePaths(
        tokenIn: Token,
        tokenOut: Token,
        options?: Pick<SwapOptions, 'block' | 'graphTraversalConfig'>,
    ): Promise<Path[]> {
        // fetch pools if we haven't yet, or if a block number is provided that doesn't match the existing.
        if (
            !this.isInitialized ||
            (options?.block && options.block !== this.blockNumber)
        ) {
            await this.fetchAndCachePools(options?.block);
        }

        return this.router.getCandidatePaths(
            tokenIn,
            tokenOut,
            this.pools,
            options?.graphTraversalConfig,
        );
    }
}
