/*
 *  The MIT License (MIT)
 *
 * Copyright (c) 2016-2017 The Regents of the University of California
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
 * associated documentation files (the "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
 * following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial
 * portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
 * BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,  FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
 * ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */

/**
 * The page posts the bare url to the sw-shortlink worker (workers/sw-shortlink), which holds
 * the TinyURL key: TinyURL's API no longer answers browser origins, and the key used to ship
 * in the bundle. Any failure hands the long url back, since a long Share URL still works.
 */
function tinyURLShortener({endpoint}) {

    if (!endpoint) {
        console.warn("No URL shortening endpoint configured. URLs will not be shortened.");
        return async function (url) { return url }
    }

    return async function (url) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            if (response.ok) {
                const json = await response.json();
                return json.data.tiny_url;
            } else {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`URL shortener error: ${response.status} ${response.statusText} - ${errorData.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.warn('URL shortening failed, sharing the long URL instead:', error);
            return url;
        }
    }
}

export {tinyURLShortener}
