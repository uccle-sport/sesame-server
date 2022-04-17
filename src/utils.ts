export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

export function retry<P>(
	fn: () => Promise<P>,
	retryCount = 5,
	sleepTime = 10000,
	exponentialFactor = 2
): Promise<P> {
	let retry = 0
	const doFn: () => Promise<P> = () => {
		return fn().catch((e) =>
			retry++ < retryCount
				? (sleepTime && sleep((sleepTime *= exponentialFactor)).then(() => doFn())) ||
				  doFn()
				: Promise.reject(e)
		)
	}
	return doFn()
}
