const script = `function _(e){return document.getElementById(e)}function niceBytes(i){let B=0,e=parseInt(i,10)||0;for(;e>=1024&&++B;)e/=1024;return e.toFixed(e<10&&B>0?1:0)+" "+["bytes","KiB","MiB","GiB","TiB","PiB","EiB","ZiB","YiB"][B]}function uploadFile(){_("result").style.display="block";var e=_("file").files[0],r=new FormData;r.append("file",e);var a=new XMLHttpRequest;a.upload.addEventListener("progress",progressHandler,!1),a.addEventListener("load",completeHandler,!1),a.addEventListener("error",errorHandler,!1),a.addEventListener("abort",abortHandler,!1),a.open("POST",location.href),a.send(r)}function progressHandler(e){_("loaded_n_total").innerHTML="Uploaded "+e.loaded+" bytes of "+e.total;var r=e.loaded/e.total*100,a=Math.round(r)+"%";_("progressBar").innerHTML=a,_("progressBar").style.width=a,_("status").innerHTML=Math.round(r)+"% uploaded... please wait"}function completeHandler(e){var r=JSON.parse(e.target.responseText);_("status").innerHTML="<b>Name:</b> "+r.name+"<br><b>Size:</b> "+niceBytes(r.size)+"<br><b>Hash:</b> "+r.hash+"<br><hr>"}function errorHandler(e){_("status").innerHTML="Upload Failed"}function abortHandler(e){_("status").innerHTML="Upload Aborted"}`;
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.0/css/bootstrap.min.css"><title>Upload Test</title></head><body class="bg-light"><div class="container"><div class="row"><div class="col-md-6 offset-md-3"><h2 class="text-center mt-5">Upload Test</h2><div class="card my-5"><div class="card-body"><h6 class="text-center mt-1 mb-3">Choose file to begin upload</h6><form id="upload_form" enctype="multipart/form-data" method="post"><div class="custom-file mb-3"><input type="file" class="custom-file-input" id="file" name="file" onchange="uploadFile()"><label class="custom-file-label" for="file">Choose file</label></div><div id="result" style="display:none"><div class="progress mb-3"><div class="progress-bar bg-success progress-bar-striped progress-bar-animated" id="progressBar" value="0" max="100" role="progressbar" aria-valuenow="10" aria-valuemin="0" aria-valuemax="100"></div></div><h5 id="status" class="text-center"></h5><p id="loaded_n_total" class="text-center"></p></div></form></div></div></div></div></div><script>${script}</script></body></html>`;

export default {
	async fetch(request, env, ctx) {
		return handleRequest(request, env, ctx);
	},
};

async function handleRequest(request, env) {
	const path = new URL(request.url).pathname;
	const searchParams = new URL(request.url).searchParams;
	if (request.method === 'GET') {
		const extraResult = await documentationOrClear({ env });
		if (path === '/') {
			return new Response(html, {
				headers: {
					'content-type': 'text/html;charset=UTF-8',
				},
			});
		} else if (path === '/script.js') {
			return new Response(script, {
				headers: {
					'content-type': 'application/javascript;charset=UTF-8',
				},
			});
		} else if (path.includes('temp')) {
			const hash = searchParams.get('hash');
			let info = {};
			let result = {};
			if (hash) {
				result = await env['my_uploader'].get(`${hash}_file`, { type: 'arrayBuffer' });
				info = await env['my_uploader'].get(hash);
				try {
					info = JSON.parse(info);
				} catch (error) {}
			} else {
				return new Response(
					JSON.stringify({
						code: 404,
						hash,
						msg: '404',
					})
				);
			}

			return new Response(
				JSON.stringify({
					code: 0,
					hash,
					info,
					result,
					extraResult,
				})
			);
		} else if (path.includes('download')) {
			try {
				const hash = searchParams.get('hash');
				let filename = '';
				let value = {};
				let info = {};
				if (hash) {
					value = await env['my_uploader'].get(`${hash}_file`, { type: 'arrayBuffer' });
					info = await env['my_uploader'].get(hash);
					try {
						info = JSON.parse(info);
					} catch (error) {}
					if (info?.name) {
						filename = info?.name;
						await env['my_uploader'].delete(hash);
						await env['my_uploader'].put(
							hash,
							JSON.stringify(
								Object.assign({}, info, {
									downloadCount: info?.downloadCount + 1,
								})
							)
						);
					} else {
						return new Response(
							JSON.stringify({
								code: 404,
								hash,
								msg: '404',
								extraResult,
							})
						);
					}
				}

				return new Response(value, {
					status: 200,
					headers: {
						'Content-Type': 'application/octet-stream',
						'Content-Disposition': `attachment; filename="${filename}"`,
					},
				});
			} catch (error) {
				return new Response(
					JSON.stringify({
						code: 503,
						error,
						msg: error.msg,
						stack: error.stack,
						extraResult,
					})
				);
			}
		} else {
			return new Response('Not found', {
				status: 404,
				statusText: 'Not found',
				extraResult,
			});
		}
	} else if (request.method === 'POST') {
		if (path === '/b64') {
			const base64File = await request.text();
			if (!base64File) {
				return new Response('File data is missing in the request body.', {
					status: 400,
					statusText: 'File data is missing in the request body.',
				});
			}
			const binaryFile = base64Decode(JSON.parse(base64File).file);
			const hash = await sha1(binaryFile);

			return new Response(
				JSON.stringify({
					hash,
				})
			);
		} else if (path === '/') {
			const formData = await request.formData();
			const file = formData.get('file');
			const data = await file.arrayBuffer();
			const hash = await sha1(data);
			await env['my_uploader'].put(`${hash}_file`, data);

			const info = {
				name: file?.name,
				type: file?.type,
				size: file?.size,
				saveAt: Date.now(),
				hash,
				downloadCount: 0,
			};
			await env['my_uploader'].put(hash, JSON.stringify(info));
			const result = await documentationOrClear({ hash, env });

			return new Response(JSON.stringify(Object.assign({}, info, result)));
		} else {
			return new Response('Not found', {
				status: 404,
				statusText: 'Not found',
			});
		}
	} else {
		return new Response('Method not allowed', {
			status: 405,
			statusText: 'Method not allowed',
		});
	}
}

async function sha1(data) {
	const digest = await crypto.subtle.digest('SHA-1', data);
	const array = Array.from(new Uint8Array(digest));
	return array.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64Decode(string) {
	string = atob(string);
	const length = string.length,
		buf = new ArrayBuffer(length),
		bufView = new Uint8Array(buf);
	for (var i = 0; i < length; i++) {
		bufView[i] = string.charCodeAt(i);
	}
	return buf;
}

async function documentationOrClear({ env } = {}) {
	let cursor = undefined;
	let allKeys = [];
	let results = [];
	// 使用分页方式列出所有键
	do {
		const listResult = await env['my_uploader'].list({
			cursor: cursor, // 分页
			limit: 1000, // 每次列出最大1000个键
		});

		// 将当前批次的键添加到结果中
		allKeys = allKeys.concat(listResult.keys);

		cursor = listResult.cursor; // 获取下一页的游标
	} while (cursor); // 继续分页直到没有更多数据

	allKeys = allKeys.reduce((all, item) => {
		const hash = item?.name;
		all.push(hash);
		return all;
	}, []);

	try {
		results = await Promise.all(
			allKeys.map(async (curHash) => {
				let curInfo = await env['my_uploader'].get(curHash);
				if (curHash?.indexOf('file') !== -1) {
					const isExist = allKeys.find((key) => key === curHash.replace('_file', ''));
					if (!isExist) {
						await Promise.allSettled([env['my_uploader'].delete(`${curHash}`)]);
					}
				} else {
					try {
						curInfo = JSON.parse(curInfo);
					} catch (error) {
						curInfo = {};
					}
					if (curInfo?.saveAt) {
						const { downloadCount, saveAt } = curInfo;
						const rules = [downloadCount >= 3, Date.now() - saveAt >= 10 * 1000 * 60];
						if (rules.some(Boolean)) {
							await Promise.allSettled([env['my_uploader'].delete(`${curHash}_file`), env['my_uploader'].delete(curHash)]);
						} 
						return {
							rules,
							curHash,
						};
					}
				}
				return {
					curInfo,
					curHash,
				};
			})
		);
	} catch (error) {
		results = {
			code: 503,
			error,
			msg: error.msg,
			stack: error.stack,
		};
	}

	return {
		allKeys,
		results,
	};
}
