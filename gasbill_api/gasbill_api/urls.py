from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.shortcuts import render
from bills.views import LoginView, RefreshView, VerifyView

def frontend_view(request):
    return render(request, 'index.html')

urlpatterns = [
    path('', frontend_view, name='frontend'),
    path('admin/', admin.site.urls),

    # JWT Auth
    path('api/auth/login/',   LoginView.as_view(),      name='token_obtain_pair'),
    path('api/auth/refresh/', RefreshView.as_view(),    name='token_refresh'),
    path('api/auth/verify/',  VerifyView.as_view(),     name='token_verify'),

    # Bills App
    path('api/', include('bills.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT) + static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
