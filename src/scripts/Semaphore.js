/*
Copyright 2020 Weiming Wu
Copyright 2021 John-Michael Glenn

Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software
without restriction, including without limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
*/
class Semaphore {
	/**
	* Creates a semaphore that limits the number of concurrent Promises being handled
	* @param {*} sleepTimeMs time to wait between calls made after the limit in milliseconds
	* @param {*} maxConcurrentRequests max number of concurrent promises being handled at any time
	*/
	constructor(maxConcurrentRequests = 2, sleepTimeMs = 500) {
		this.currentRequests = []
		this.runningRequests = []
		this.sleepTimeMs = sleepTimeMs
		this.maxConcurrentRequests = maxConcurrentRequests
	}

	/**
	* Returns a Promise that will eventually return the result of the function passed in
	* Use this to limit the number of concurrent function executions
	* @param {*} fnToCall function that has a cap on the number of concurrent executions
	* @param  {...any} args any arguments to be passed to fnToCall
	* @returns Promise that will resolve with the resolved value as if the function passed in was directly called
	*/
	callFn(fnToCall, ...args) {
		return new Promise((resolve, reject) => {
			this.currentRequests.push({
				resolve
				,reject
				,fnToCall
				,args
			})
			this.tryNext()
		})
	}

	sleep = () => new Promise(resolve => setTimeout(resolve, this.sleepTimeMs))

	tryNext() {
		if (!this.currentRequests.length) return
		if (this.runningRequests.length < this.maxConcurrentRequests) {
			const request = this.currentRequests.shift()
			let { resolve, reject, fnToCall, args } = request
			this.runningRequests.push(request)
			fnToCall(...args)
				.then(res => resolve(res))
				.catch(err => reject(err))
				.finally(async () => {
					this.runningRequests.splice(this.runningRequests.findIndex(x => x.args === request.args && x.fnToCall === fnToCall), 1)
					await this.sleep()
					this.tryNext()
				})
		}
	}
}