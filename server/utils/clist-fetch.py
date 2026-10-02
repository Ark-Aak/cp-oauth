"""Fixed-host Clist HTTP adapter. stdin request -> {status, body, error} stdout."""

import json
import math
import sys
import time
from urllib.parse import urljoin, urlsplit

STARTED_AT = time.monotonic()

from curl_cffi import requests
from curl_cffi.const import CurlOpt

IMPERSONATE = 'chrome131'
MAX_BYTES = 2 * 1024 * 1024


def valid_url(value):
    if not isinstance(value, str) or any(ord(char) <= 32 for char in value) or '\\' in value:
        return False
    try:
        parsed = urlsplit(value)
        return (parsed.scheme == 'https' and parsed.hostname == 'clist.by'
                and parsed.port in (None, 443) and not parsed.username
                and not parsed.password and not parsed.fragment)
    except ValueError:
        return False


def main():
    deadline = STARTED_AT + 20

    def remaining():
        value = deadline - time.monotonic()
        if value <= 0:
            raise TimeoutError()
        return value

    def request(session, method, url, headers=None, data=None):
        # Follow only validated same-host redirects, preserving the total deadline.
        for _ in range(11):
            timeout = remaining()
            # curl_cffi otherwise uses only an idle timeout for streamed responses.
            session.curl_options[CurlOpt.TIMEOUT_MS] = max(1, int(timeout * 1000))
            response = session.request(method, url, headers=headers, data=data,
                                       timeout=timeout, allow_redirects=False, stream=True)
            if response.status_code not in (301, 302, 303, 307, 308):
                return response
            location = response.headers.get('Location')
            response.close()
            next_url = urljoin(url, location) if location else ''
            if not valid_url(next_url):
                raise ValueError()
            if response.status_code == 303 or (response.status_code in (301, 302) and method == 'POST'):
                method, data = 'GET', None
            url = next_url
        raise ValueError()

    try:
        raw = sys.stdin.buffer.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError()
        params = json.loads(raw)
        if not isinstance(params, dict):
            raise ValueError()
        method = params.get('method')
        url = params.get('url')
        headers = params.get('headers', {})
        data = params.get('data')
        session_init = params.get('sessionInit')
        deadline_seconds = params.get('deadlineSeconds', 20)
        if (method not in ('GET', 'POST') or not valid_url(url)
                or (session_init is not None and not valid_url(session_init))
                or not isinstance(headers, dict)
                or not all(isinstance(k, str) and isinstance(v, str) for k, v in headers.items())
                or (data is not None and (not isinstance(data, dict)
                    or not all(isinstance(k, str) and isinstance(v, str) for k, v in data.items())))
                or isinstance(deadline_seconds, bool)
                or not isinstance(deadline_seconds, (int, float))
                or not math.isfinite(deadline_seconds) or deadline_seconds <= 0):
            raise ValueError()
        deadline = STARTED_AT + min(20, deadline_seconds)
        with requests.Session(impersonate=IMPERSONATE) as session:
            if session_init:
                response = request(session, 'GET', session_init)
                response.close()
            if method == 'POST' and session_init:
                headers.setdefault('Origin', 'https://clist.by')
                headers.setdefault('Referer', 'https://clist.by/')
            response = request(session, method, url, headers, data)
            try:
                body = bytearray()
                for chunk in response.iter_content(chunk_size=65536):
                    remaining()
                    if len(body) + len(chunk) > MAX_BYTES:
                        raise ValueError()
                    body.extend(chunk)
                result = {'status': response.status_code,
                          'body': body.decode(response.encoding or 'utf-8', errors='replace'),
                          'error': None}
            finally:
                response.close()
        remaining()
        output = json.dumps(result, ensure_ascii=False).encode('utf-8')
        if len(output) > MAX_BYTES:
            raise ValueError()
    except (TimeoutError, requests.exceptions.Timeout):
        output = json.dumps({'status': 0, 'body': '', 'error': 'timeout'}).encode('utf-8')
    except (ValueError, TypeError, UnicodeError, LookupError):
        output = json.dumps({'status': 0, 'body': '', 'error': 'invalid_response'}).encode('utf-8')
    except Exception:
        error = 'timeout' if time.monotonic() >= deadline else 'network'
        output = json.dumps({'status': 0, 'body': '', 'error': error}).encode('utf-8')
    sys.stdout.buffer.write(output)


if __name__ == '__main__':
    main()
