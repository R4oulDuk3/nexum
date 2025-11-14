# nexum-api-client.LocationsApi

All URIs are relative to *http://localhost*

Method | HTTP request | Description
------------- | ------------- | -------------
[**api_locations_history_entity_id_get**](LocationsApi.md#api_locations_history_entity_id_get) | **GET** /api/locations/history/{entity_id} | Get location history for an entity
[**api_locations_latest_get**](LocationsApi.md#api_locations_latest_get) | **GET** /api/locations/latest | Get latest location for each entity
[**api_locations_nearby_post**](LocationsApi.md#api_locations_nearby_post) | **POST** /api/locations/nearby | Find entities near a location
[**api_locations_node_id_get**](LocationsApi.md#api_locations_node_id_get) | **GET** /api/locations/node-id | Get current node ID
[**api_locations_post**](LocationsApi.md#api_locations_post) | **POST** /api/locations/ | Record a new location report
[**api_locations_types_get**](LocationsApi.md#api_locations_types_get) | **GET** /api/locations/types | Get list of valid entity types


# **api_locations_history_entity_id_get**
> LocationListResponseSchema api_locations_history_entity_id_get(entity_id, since=since, limit=limit)

Get location history for an entity

Retrieve location history for a specific entity

### Example


```python
import time
import os
import nexum-api-client
from nexum-api-client.models.location_list_response_schema import LocationListResponseSchema
from nexum-api-client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost
# See configuration.py for a list of all supported configuration parameters.
configuration = nexum-api-client.Configuration(
    host = "http://localhost"
)


# Enter a context with an instance of the API client
with nexum-api-client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = nexum-api-client.LocationsApi(api_client)
    entity_id = 'entity_id_example' # str | Entity UUID
    since = 56 # int | UTC milliseconds timestamp (optional) (optional)
    limit = 100 # int | Maximum number of results (default: 100) (optional) (default to 100)

    try:
        # Get location history for an entity
        api_response = api_instance.api_locations_history_entity_id_get(entity_id, since=since, limit=limit)
        print("The response of LocationsApi->api_locations_history_entity_id_get:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling LocationsApi->api_locations_history_entity_id_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **entity_id** | **str**| Entity UUID | 
 **since** | **int**| UTC milliseconds timestamp (optional) | [optional] 
 **limit** | **int**| Maximum number of results (default: 100) | [optional] [default to 100]

### Return type

[**LocationListResponseSchema**](LocationListResponseSchema.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Location history retrieved successfully |  -  |
**400** | Invalid UUID or parameter |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_locations_latest_get**
> LocationListResponseSchema api_locations_latest_get(type=type, limit=limit)

Get latest location for each entity

Retrieve the most recent location report for each entity

### Example


```python
import time
import os
import nexum-api-client
from nexum-api-client.models.location_list_response_schema import LocationListResponseSchema
from nexum-api-client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost
# See configuration.py for a list of all supported configuration parameters.
configuration = nexum-api-client.Configuration(
    host = "http://localhost"
)


# Enter a context with an instance of the API client
with nexum-api-client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = nexum-api-client.LocationsApi(api_client)
    type = 'type_example' # str | Filter by entity type (optional) (optional)
    limit = 100 # int | Maximum number of results (default: 100) (optional) (default to 100)

    try:
        # Get latest location for each entity
        api_response = api_instance.api_locations_latest_get(type=type, limit=limit)
        print("The response of LocationsApi->api_locations_latest_get:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling LocationsApi->api_locations_latest_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **type** | **str**| Filter by entity type (optional) | [optional] 
 **limit** | **int**| Maximum number of results (default: 100) | [optional] [default to 100]

### Return type

[**LocationListResponseSchema**](LocationListResponseSchema.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Latest locations retrieved successfully |  -  |
**400** | Invalid parameter |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_locations_nearby_post**
> NearbyResponseSchema api_locations_nearby_post(nearby_request_schema)

Find entities near a location

Search for entities within a specified radius of a location

### Example


```python
import time
import os
import nexum-api-client
from nexum-api-client.models.nearby_request_schema import NearbyRequestSchema
from nexum-api-client.models.nearby_response_schema import NearbyResponseSchema
from nexum-api-client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost
# See configuration.py for a list of all supported configuration parameters.
configuration = nexum-api-client.Configuration(
    host = "http://localhost"
)


# Enter a context with an instance of the API client
with nexum-api-client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = nexum-api-client.LocationsApi(api_client)
    nearby_request_schema = nexum-api-client.NearbyRequestSchema() # NearbyRequestSchema | 

    try:
        # Find entities near a location
        api_response = api_instance.api_locations_nearby_post(nearby_request_schema)
        print("The response of LocationsApi->api_locations_nearby_post:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling LocationsApi->api_locations_nearby_post: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **nearby_request_schema** | [**NearbyRequestSchema**](NearbyRequestSchema.md)|  | 

### Return type

[**NearbyResponseSchema**](NearbyResponseSchema.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Nearby entities found |  -  |
**400** | Invalid request data |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_locations_node_id_get**
> NodeIdResponseSchema api_locations_node_id_get()

Get current node ID

Retrieve the ID of the current mesh node

### Example


```python
import time
import os
import nexum-api-client
from nexum-api-client.models.node_id_response_schema import NodeIdResponseSchema
from nexum-api-client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost
# See configuration.py for a list of all supported configuration parameters.
configuration = nexum-api-client.Configuration(
    host = "http://localhost"
)


# Enter a context with an instance of the API client
with nexum-api-client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = nexum-api-client.LocationsApi(api_client)

    try:
        # Get current node ID
        api_response = api_instance.api_locations_node_id_get()
        print("The response of LocationsApi->api_locations_node_id_get:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling LocationsApi->api_locations_node_id_get: %s\n" % e)
```



### Parameters

This endpoint does not need any parameter.

### Return type

[**NodeIdResponseSchema**](NodeIdResponseSchema.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Current node ID |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_locations_post**
> LocationSuccessResponseSchema api_locations_post(location_request_schema)

Record a new location report

Add a location report for an entity (responder, civilian, etc.)

### Example


```python
import time
import os
import nexum-api-client
from nexum-api-client.models.location_request_schema import LocationRequestSchema
from nexum-api-client.models.location_success_response_schema import LocationSuccessResponseSchema
from nexum-api-client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost
# See configuration.py for a list of all supported configuration parameters.
configuration = nexum-api-client.Configuration(
    host = "http://localhost"
)


# Enter a context with an instance of the API client
with nexum-api-client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = nexum-api-client.LocationsApi(api_client)
    location_request_schema = nexum-api-client.LocationRequestSchema() # LocationRequestSchema | 

    try:
        # Record a new location report
        api_response = api_instance.api_locations_post(location_request_schema)
        print("The response of LocationsApi->api_locations_post:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling LocationsApi->api_locations_post: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **location_request_schema** | [**LocationRequestSchema**](LocationRequestSchema.md)|  | 

### Return type

[**LocationSuccessResponseSchema**](LocationSuccessResponseSchema.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**201** | Location added successfully |  -  |
**400** | Invalid request data |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_locations_types_get**
> EntityTypesResponseSchema api_locations_types_get()

Get list of valid entity types

Retrieve all valid entity type values

### Example


```python
import time
import os
import nexum-api-client
from nexum-api-client.models.entity_types_response_schema import EntityTypesResponseSchema
from nexum-api-client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost
# See configuration.py for a list of all supported configuration parameters.
configuration = nexum-api-client.Configuration(
    host = "http://localhost"
)


# Enter a context with an instance of the API client
with nexum-api-client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = nexum-api-client.LocationsApi(api_client)

    try:
        # Get list of valid entity types
        api_response = api_instance.api_locations_types_get()
        print("The response of LocationsApi->api_locations_types_get:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling LocationsApi->api_locations_types_get: %s\n" % e)
```



### Parameters

This endpoint does not need any parameter.

### Return type

[**EntityTypesResponseSchema**](EntityTypesResponseSchema.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | List of entity types |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

