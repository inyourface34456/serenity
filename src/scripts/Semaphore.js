/*
 * Copyright 2020 Weiming Wu
 * Copyright 2022 John-Michael Glenn
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify, merge,
 * publish, distribute, sublicense, and/or sell copies of the Software, and to permit
 * persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
 * PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
 * FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */
class Semaphore {
	constructor(options = { "refresh": 1000, "parallel": 2, "burst": { "refresh": 10000, "parallel": 8 } }) {
		this.currentRequests = [];
		this.runningParallelRequests = [];
		this.parallelRefresh = options.refresh;
		this.parallelRequests = options.parallel;
		this.parallelTimestamp = -1;
		this.burstRequests = 0;
		if (options.burst !== undefined) {
			this.runningBurstRequests = [];
			this.burstRefresh = options.burst.refresh;
			this.burstRequests = options.burst.parallel;
			this.burstTimestamp = -1;
		}
	}

	// This adds a request to the queue and attempts to process it
	add(fn, ...args) {
		return new Promise((resolve, reject) => {
			this.currentRequests.push({
				resolve,
				reject,
				fn,
				args
			});
			this.next();
		});
	}

	sleep(ms) {
		return new Promise(function(resolve) {
			return ms > 0 ? setTimeout(resolve, ms || this.parallelRefresh) : resolve();
		});
	}

	// This checks that we haven't hit our request limit within the time limit, or else it rejects the process command. This allows us to throttle the number of active requests
	next() {
		// Check if out of requests or at the limit and stop early if either are true
		if (this.currentRequests.length < 1 || this.runningParallelRequests.length === this.parallelRequests + this.burstRequests) return;

		// If we're still setting regular parallel requests, set the parallel timestamp
		if (this.runningParallelRequests.length < this.parallelRequests) {
			if (this.parallelTimestamp === -1 || performance.now() - this.parallelTimestamp >= this.parallelRefresh) this.parallelTimestamp = performance.now();

			// Get the next request
			const request = this.currentRequests.shift();
			const { resolve, reject, fn, args } = request;
			// Add it to the list of requests being processed (this will allow for request cancelling/resuming)
			this.runningParallelRequests.push(request);
			// Then run the request. First wrap it in a Promise if it isn't already one
			(typeof fn === "object" && typeof fn.then === "function" ? fn(...args) : new Promise(resolve => {
				// If this has an error, it'll be passed into the catch below to be rejected and passed up to the script that called 'add' for proper error handling
				resolve(fn(...args));
			}))
				.then(res => resolve(res))
				.catch(err => reject(err))
				.finally(async() => {
					// Once it finishes (regardless of success/failure), remove it from list of active requests
					this.runningParallelRequests.splice(this.runningParallelRequests.findIndex(x => x.args === request.args && x.fn === fn), 1);
					// If we're out of requests, stop early
					if (this.currentRequests.length < 1) return;

					// Wait for the remaining time until the refresh timer ends (if negative, it'll be fired instantly)
					await this.sleep(this.parallelRefresh - (performance.now() - this.parallelTimestamp));
					this.next();
				});
		} else if (this.runningBurstRequests.length < this.burstRequests) {
			// Otherwise we're processing a burst request
			if (this.burstTimestamp === -1 || performance.now() - this.burstTimestamp >= this.burstRefresh) this.burstTimestamp = performance.now();

			// Get the next request
			const request = this.currentRequests.shift();
			const { resolve, reject, fn, args } = request;
			// Add it to the list of requests being processed (this will allow for request cancelling/resuming)
			this.runningBurstRequests.push(request);
			// Then run the request. First wrap it in a Promise if it isn't already one
			(typeof fn === "object" && typeof fn.then === "function" ? fn(...args) : new Promise(resolve => {
				// If this has an error, it'll be passed into the catch below to be rejected and passed up to the script that called 'add' for proper error handling
				resolve(fn(...args));
			}))
				.then(res => resolve(res))
				.catch(err => reject(err))
				.finally(async() => {
					// Once it finishes (regardless of success/failure), remove it from list of active requests
					this.runningBurstRequests.splice(this.runningBurstRequests.findIndex(x => x.args === request.args && x.fn === fn), 1);
					// If we're out of requests, stop early
					if (this.currentRequests.length < 1) return;

					// Wait for the remaining time until the refresh timer ends (if negative, it'll be fired instantly)
					await this.sleep(this.burstRefresh - (performance.now() - this.burstTimestamp));
					this.next();
				});
		}
	}
}