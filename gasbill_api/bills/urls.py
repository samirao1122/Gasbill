from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'customers',   views.CustomerViewSet,    basename='customer')
router.register(r'tariffs',     views.GasTariffViewSet,   basename='tariff')
router.register(r'readings',    views.MeterReadingViewSet, basename='reading')
router.register(r'bills',       views.GasBillViewSet,      basename='bill')
router.register(r'payments',    views.PaymentViewSet,      basename='payment')
router.register(r'complaints',  views.ComplaintViewSet,    basename='complaint')

urlpatterns = [
    # Auth helpers
    path('auth/register/', views.register_user, name='register'),
    path('auth/profile/',  views.my_profile,    name='profile'),

    # Dashboard
    path('dashboard/', views.dashboard, name='dashboard'),

    # All CRUD routes
    path('', include(router.urls)),
]
