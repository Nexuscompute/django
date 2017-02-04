from django.contrib.auth.models import User
from django.core.validators import RegexValidator


class NumberUsernameValidator(RegexValidator):
    regex = r'^[\d]+$'
    message = 'Enter a valid username. This value may contain only numbers.'


class CustomValidatorUser(User):
    username_validator = NumberUsernameValidator()

    class Meta:
        proxy = True
