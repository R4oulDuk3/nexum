# NearbyResponseSchema


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**center** | [**Position**](Position.md) |  | [optional] 
**count** | **int** | Number of entities found | [optional] 
**data** | [**List[LocationResponse]**](LocationResponse.md) | List of nearby locations | [optional] 
**radius_km** | **float** | Search radius in kilometers | [optional] 
**status** | **str** | Response status | [optional] 

## Example

```python
from nexum-api-client.models.nearby_response_schema import NearbyResponseSchema

# TODO update the JSON string below
json = "{}"
# create an instance of NearbyResponseSchema from a JSON string
nearby_response_schema_instance = NearbyResponseSchema.from_json(json)
# print the JSON string representation of the object
print NearbyResponseSchema.to_json()

# convert the object into a dict
nearby_response_schema_dict = nearby_response_schema_instance.to_dict()
# create an instance of NearbyResponseSchema from a dict
nearby_response_schema_form_dict = nearby_response_schema.from_dict(nearby_response_schema_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


