from django.urls import path

from .views import generate_pdf

urlpatterns = [
    path('pdf', generate_pdf, name='prescription-pdf'),
]
