import base64
import hashlib
from urllib.parse import urlsplit
from urllib.request import URLError, urlopen

from django.conf import settings
from django.templatetags.static import static
from django.utils.safestring import mark_safe


class Asset:
    def __init__(self, path, integrity=None):
        self.path = path
        self.integrity = integrity

    def __eq__(self, other):
        return self.__class__ == other.__class__ and self.path == other.path

    def __str__(self):
        if urlsplit(self.path).netloc:
            # Check subresource integrity
            if not self.integrity and settings.DEBUG:
                try:
                    integrity = generate_sha256(self.path)
                except URLError as exc:
                    raise RuntimeWarning(
                        'Unable to fetch the asset "{path}" in order to calculate '
                        'its subresource integrity ({err}).'.format(
                            path=self.path,
                            err=str(exc)
                        )
                    )
                else:
                    raise RuntimeWarning(
                        'The asset "{path}" is missing an integrity checksum. '
                        'Checksum of current file is "{csum}". If you think it’s valid, '
                        'set that value as the `integrity` kwarg of the asset.'.format(
                            path=self.path,
                            csum=integrity,
                        )
                    )
            return self.path  # Do not touch absolute URLs
        return static(self.path)

    def attrs_to_str(self, attrs):
        return ' '.join('{}="{}"'.format(k, v) for k, v in attrs.items())


class CSS(Asset):
    def __str__(self):
        path = super().__str__()
        attrs = {'href': path, 'rel': 'stylesheet', 'type': 'text/css'}
        if self.integrity:
            attrs.update({'integrity': self.integrity, 'crossorigin': 'anonymous'})
        return mark_safe('<link {}>'.format(self.attrs_to_str(attrs)))


class JS(Asset):
    def __str__(self):
        path = super().__str__()
        attrs = {'src': path}
        if self.integrity:
            attrs.update({'integrity': self.integrity, 'crossorigin': 'anonymous'})
        return mark_safe('<script {}></script>'.format(self.attrs_to_str(attrs)))


def generate_sha256(url):
    """
    Produce a sha256 hash for `file_ ` suitable for subresource integrity values.
    """
    with urlopen(url) as response:
        body = response.read()
    digest = hashlib.sha256(body).digest()
    sha = base64.b64encode(digest).decode()
    return 'sha256-{}'.format(sha)
